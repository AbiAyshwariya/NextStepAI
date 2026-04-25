"use server";

import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";

import { generateAIInsights } from "./dashboard";

export async function updateUser(data) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({
    where: {
      clerkUserId: userId,
    },
  });

  if (!user) throw new Error("User not found");

  try {
    const result = await db.$transaction(
      async (tx) => {
        let industryInsight = await tx.industryInsight.findUnique({
          where: {
            industry: data.industry,
          },
        });

        if (!industryInsight && process.env.GEMINI_API_KEY) {
         const insights = await generateAIInsights(data.industry);
         
                 const industryInsight=await db.industryInsight.create({
                     data:{
                         industry:data.industry,
                         ...insights,
                         nextUpdate:new Date(Date.now()+7*24*60*60*1000),
                     }
                 });
         
        }

        const updatedUser = await tx.user.update({
          where: {
            id: user.id,
          },
          data: {
            industry: data.industry,
            experience: data.experience,
            bio: data.bio,
            skills: data.skills,
          },
        });

        return { updatedUser, industryInsight };
      },
      {
        timeout: 12000,
      }
    );

    return { success: true, ...result };
  } catch (error) {
    console.log("Error updating user and industry:", error.message);
    throw new Error("Failed to Update profile: " + error.message);
  }
}

export async function getUserOnboardingStatus() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({
    where: {
      clerkUserId: userId,
    },
  });

  if (!user) throw new Error("User not found");

  try {
    const userStatus = await db.user.findUnique({
      where: {
        clerkUserId: userId,
      },
      select: {
        industry: true,
      },
    });

    return {
      isOnboarded: !!userStatus?.industry,
    };
  } catch (error) {
    console.error(
      "Error checking onboarding status:",
      error.message
    );
    throw new Error("Failed to check onboarding status");
  }
}