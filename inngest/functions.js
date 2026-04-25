import { GoogleGenerativeAI } from "@google/generative-ai";
import { inngest } from "./client";
import { db } from "@/lib/prisma";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
});

export const generateIndustryInsight = inngest.createFunction(
  { name: "Generate Industry Insights" },
  { cron: "0 0 * * 0" },
  async ({ step }) => {

    const industries = await step.run("Fetch industries", async () => {
      return await db.industryInsight.findMany({
        select: { industry: true },
      });
    });

    for (const { industry } of industries) {

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

      const res = await step.ai.wrap("gemini", async () => {
        return await model.generateContent(prompt);
      });

      // ✅ Robust extraction (handles multiple Gemini formats)
      const candidate = res?.response?.candidates?.[0];

      let text =
        candidate?.content?.parts?.[0]?.text ||
        (typeof candidate?.content === "string" ? candidate.content : null);

      // ✅ Skip instead of crashing entire job
      if (!text) {
        console.log(`Skipping ${industry} - no response`);
        continue;
      }

      // ✅ Clean response safely
      const cleanedText = text
        .replace(/```(?:json)?\n?/g, "")
        .replace(/^[^{]*/, "")
        .trim();

      let insights;

      try {
        insights = JSON.parse(cleanedText);
      } catch (err) {
        console.log(`Invalid JSON for ${industry}`);
        continue;
      }

      // ✅ DB update wrapped safely
      await step.run(`Update ${industry}`, async () => {
        await db.industryInsight.update({
          where: { industry },
          data: {
            ...insights,
            lastUpdated: new Date(),
            nextUpdate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });
      });
    }
  }
);