import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { evaluateSubmission } from '@/lib/milestones';

// Ensure this route is dynamic
export const dynamic = 'force-dynamic';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

interface JwtPayload {
  participantId: string;
  email: string;
  role: string;
  teamId?: string;
  isLeader?: boolean;
}

// Define the Milestone type
type MilestoneFromDB = {
  id: string;
  title: string;
  description: string;
  dueDate: Date;
  status: string;
  requirements: string; // JSON string in the database
  submissionCount: number;
  submissionLink?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

// GET /api/milestones - Get all milestones
export async function GET() {
  try {
    // Check if the Milestone model exists in the Prisma client
    const milestones = await prisma.$queryRaw`SELECT * FROM "Milestone" ORDER BY "dueDate" ASC`;

    // Get the participant ID from the JWT token
    const cookieStore = cookies();
    const tokenCookie = cookieStore.get('token');
    
    // If no token is found, return milestones without hasSubmitted
    if (!tokenCookie) {
      console.log('No token cookie found in request');
      // Parse the requirements JSON string for each milestone
      const formattedMilestones = (milestones as MilestoneFromDB[]).map((milestone) => ({
        ...milestone,
        requirements: JSON.parse(milestone.requirements),
        hasSubmitted: false,
      }));

      return NextResponse.json(formattedMilestones);
    }
    
    // Verify the token
    let decoded: JwtPayload;
    try {
      decoded = jwt.verify(tokenCookie.value, JWT_SECRET) as JwtPayload;
      console.log('Decoded token:', decoded);
    } catch (err) {
      console.error('Token verification failed:', err);
      // If token is invalid, return milestones without hasSubmitted
      const formattedMilestones = (milestones as MilestoneFromDB[]).map((milestone) => ({
        ...milestone,
        requirements: JSON.parse(milestone.requirements),
        hasSubmitted: false,
      }));

      return NextResponse.json(formattedMilestones);
    }
    
    // Extract participantId directly from the token
    const participantId = decoded.participantId;
    
    // If participantId is undefined, log the issue and return milestones without hasSubmitted
    if (!participantId) {
      console.error('No participantId found in token:', decoded);
      const formattedMilestones = (milestones as MilestoneFromDB[]).map((milestone) => ({
        ...milestone,
        requirements: JSON.parse(milestone.requirements),
        hasSubmitted: false,
      }));

      return NextResponse.json(formattedMilestones);
    }
    
    // Get the participant from the database
    const participant = await prisma.participant.findUnique({
      where: { id: participantId },
    });
    
    // If no participant is found, return milestones without hasSubmitted
    if (!participant) {
      // Parse the requirements JSON string for each milestone
      const formattedMilestones = (milestones as MilestoneFromDB[]).map((milestone) => ({
        ...milestone,
        requirements: JSON.parse(milestone.requirements),
        hasSubmitted: false,
      }));

      return NextResponse.json(formattedMilestones);
    }

    // The participant's own submissions, with enough detail for the dashboard
    // to show the REAL state. It previously returned only `hasSubmitted`, so a
    // participant could not see whether they were accepted, rejected, or asked
    // to resubmit — nor why.
    const submissions = await prisma.milestoneSubmission.findMany({
      where: { participantId: participant.id },
      select: {
        milestoneId: true,
        reviewStatus: true,
        reviewComment: true,
        reviewedAt: true,
        resubmissionCount: true,
        resubmissionDeadline: true,
        isLate: true,
        submittedAt: true,
      },
    });
    const byMilestone = new Map(submissions.map((sub) => [sub.milestoneId, sub]));

    const now = new Date();
    const formattedMilestones = (milestones as MilestoneFromDB[]).map((milestone) => {
      const sub = byMilestone.get(milestone.id) ?? null;
      // Same helper the submission API enforces with, so the button state and
      // the server's answer can never disagree.
      const verdict = evaluateSubmission({
        now,
        milestone: {
          dueDate: new Date(milestone.dueDate),
          allowLateSubmission: Boolean((milestone as any).allowLateSubmission),
        },
        existing: sub,
      });
      return {
        ...milestone,
        requirements: JSON.parse(milestone.requirements),
        hasSubmitted: Boolean(sub),
        reviewStatus: sub?.reviewStatus ?? null,
        reviewComment: sub?.reviewComment ?? null,
        resubmissionCount: sub?.resubmissionCount ?? 0,
        canSubmit: verdict.canSubmit,
        canResubmit: verdict.canSubmit && verdict.isResubmission,
        submitBlockedReason: verdict.reason ?? null,
        effectiveDeadline: verdict.effectiveDeadline.toISOString(),
        isLate: sub?.isLate ?? false,
      };
    });

    return NextResponse.json(formattedMilestones);
  } catch (error) {
    console.error("Error fetching milestones:", error);
    return NextResponse.json(
      { error: "Failed to fetch milestones" },
      { status: 500 }
    );
  }
}
