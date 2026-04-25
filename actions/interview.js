"use server";

import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Use stable/light model for free tier
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

/* ------------------ RETRY WRAPPER ------------------ */
async function callGeminiWithRetry(prompt, retries = 3, delay = 2000) {
  try {
    const result = await model.generateContent(prompt);
    return result;
  } catch (err) {
    if (retries === 0) throw err;

    console.warn(`Gemini retry... attempts left: ${retries}`);
    await new Promise((res) => setTimeout(res, delay));

    return callGeminiWithRetry(prompt, retries - 1, delay * 2); // exponential backoff
  }
}

/* ------------------ GENERATE QUIZ ------------------ */
export async function generateQuiz() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
    select: {
      industry: true,
      skills: true,
    },
  });

  if (!user) throw new Error("User not found");

  const prompt = `
Generate 5 technical interview MCQ questions for a ${user.industry} professional
${user.skills?.length ? `with skills in ${user.skills.join(", ")}` : ""}.

STRICT RULES:
- Return ONLY valid JSON (no markdown, no explanation outside JSON)
- Each question must have exactly 4 options
- Keep explanations short (1 sentence)

Format:
{
  "questions": [
    {
      "question": "string",
      "options": ["string", "string", "string", "string"],
      "correctAnswer": "string",
      "explanation": "string"
    }
  ]
}
`;

  try {
    const result = await callGeminiWithRetry(prompt);
    const text = result.response.text();

    if (!text || text.length < 50) {
      throw new Error("Empty or invalid response");
    }

    // Clean markdown if present
    const cleanedText = text.replace(/```(?:json)?\n?/g, "").trim();

    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      console.error("Invalid JSON format:", cleanedText);
      throw new Error("Invalid AI response format");
    }

    const quiz = JSON.parse(jsonMatch[0]);

    return quiz.questions;
  } catch (err) {
    console.error("Gemini failed, using fallback", err);

    return [
      {
        question: "What is React?",
        options: ["Library", "Framework", "Language", "Database"],
        correctAnswer: "Library",
        explanation: "React is a JavaScript library for building UIs.",
      },
      {
        question: "What is useState?",
        options: ["Hook", "Component", "API", "Library"],
        correctAnswer: "Hook",
        explanation: "useState is a React hook used to manage state.",
      },
    ];
  }
}

/* ------------------ SAVE QUIZ RESULT ------------------ */
export async function saveQuizResult(questions, answers, score) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
  });

  if (!user) throw new Error("User not found");

  const questionResults = questions.map((q, index) => ({
    question: q.question,
    answer: q.correctAnswer,
    userAnswer: answers[index],
    isCorrect: q.correctAnswer === answers[index],
    explanation: q.explanation,
  }));

  /* 🚀 Removed second Gemini call to avoid 503 */
  /* You can re-enable later if needed */

  let improvementTip = null;

  const wrongAnswers = questionResults.filter((q) => !q.isCorrect);

  if (wrongAnswers.length > 0) {
    improvementTip =
      "Focus on strengthening core concepts and practice similar interview questions regularly.";
  }

  try {
    const assessment = await db.assessment.create({
      data: {
        userId: user.id,
        quizScore: score,
        questions: questionResults,
        category: "Technical",
        improvementTip,
      },
    });

    return assessment;
  } catch (error) {
    console.error("Error saving quiz result:", error);
    throw new Error("Failed to save quiz result");
  }
}

/* ------------------ GET ASSESSMENTS ------------------ */
export async function getAssessments() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
  });

  if (!user) throw new Error("User not found");

  try {
    const assessments = await db.assessment.findMany({
      where: {
        userId: user.id,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    return assessments;
  } catch (error) {
    console.error("Error fetching assessments:", error);
    throw new Error("Failed to fetch assessments");
  }
}