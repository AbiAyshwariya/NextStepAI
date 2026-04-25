"use server";

import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { redirect } from "next/navigation";
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
});

// ================= AI FUNCTION =================
export const generateAIInsights = async (industry) => {
  if (!industry) throw new Error("Industry is required");

  const prompt = `
Analyze the ${industry} industry and return ONLY valid JSON:

{
  "salaryRanges": [
    { "role": "string", "min": number, "max": number, "median": number, "location": "string" }
  ],
  "growthRate": number,
  "demandLevel": "High" | "Medium" | "Low",
  "topSkills": ["skill1", "skill2", "skill3", "skill4", "skill5"],
  "marketOutlook": "POSITIVE" | "NEUTRAL" | "NEGATIVE",
  "keyTrends": ["trend1", "trend2", "trend3", "trend4", "trend5"],
  "recommendedSkills": ["skill1", "skill2", "skill3", "skill4", "skill5"]
}

Rules:
- STRICT JSON ONLY
- No markdown
- At least 5 roles
`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  const cleaned = text.replace(/```(?:json)?/g, "").trim();

  return JSON.parse(cleaned);
};
export async function getIndustryInsights() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
  });

  if (!user) throw new Error("User not found");

  // ✅ FIX: redirect-safe handling
  if (!user.industry) {
  redirect("/onboarding");
}

  // ================= CACHE CHECK =================
  let industryInsight = await db.industryInsight.findUnique({
    where: { industry: user.industry },
  });

  const isExpired =
    industryInsight &&
    new Date(industryInsight.nextUpdate) < new Date();

  // ================= GENERATE IF NEEDED =================
  if (!industryInsight || isExpired) {
  console.log("⚡ Calling Gemini API...");

  // 1. FIRST get AI response (outside DB transaction safety issues)
  const insights = await generateAIInsights(user.industry);

  // 2. THEN save to DB safely
  industryInsight = await db.industryInsight.upsert({
    where: { industry: user.industry },
    update: {
      salaryRanges: insights.salaryRanges,
      growthRate: insights.growthRate,
      demandLevel: insights.demandLevel || insights.DemandLevel,
      topSkills: insights.topSkills,
      marketOutlook: insights.marketOutlook,
      keyTrends: insights.keyTrends,
      recommendedSkills: insights.recommendedSkills,
      nextUpdate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    create: {
      industry: user.industry,
      salaryRanges: insights.salaryRanges,
      growthRate: insights.growthRate,
      demandLevel: insights.demandLevel || insights.DemandLevel,
      topSkills: insights.topSkills,
      marketOutlook: insights.marketOutlook,
      keyTrends: insights.keyTrends,
      recommendedSkills: insights.recommendedSkills,
      nextUpdate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
} else {
    console.log("✅ Using cached insights");
  }

  return industryInsight;
}