import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import { dispatchNotification } from "@/lib/notify";
import { requireAdmin } from "@/lib/notification-auth";

const UNAUTHORIZED = () =>
  NextResponse.json({ error: "غير مصرح. هذه الخدمة متاحة للمسؤولين فقط." }, { status: 401 });

// Ensure this route is dynamic
export const dynamic = 'force-dynamic';

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

// POST /api/admin/milestones - Create a new milestone
export async function POST(request: NextRequest) {
  if (!requireAdmin(cookies().get("token")?.value)) return UNAUTHORIZED();
  try {
    const body = await request.json();
    const { title, description, dueDate, status, requirements, phaseId, allowLateSubmission } = body;

    // Validate required fields
    if (!title || !description || !dueDate || !requirements) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }
    
    // Validate that the due date is not in the past
    const selectedDueDate = new Date(dueDate);
    const currentDate = new Date();
    
    if (selectedDueDate < currentDate) {
      return NextResponse.json(
        { error: "لا يمكن اختيار موعد نهائي في الماضي" },
        { status: 400 }
      );
    }

    // Convert requirements array to JSON string for storage
    const requirementsJson = JSON.stringify(requirements);
    const id = randomUUID();
    const now = new Date().toISOString();
    const statusValue = status || "upcoming";
    const formattedDueDate = new Date(dueDate).toISOString();

    // Create the new milestone using raw SQL with quoted table name and column names for PostgreSQL compatibility
    await prisma.$executeRaw`
      INSERT INTO "Milestone" (id, title, description, "dueDate", status, requirements, "submissionCount", "phaseId", "allowLateSubmission", "createdAt", "updatedAt")
      VALUES (${id}, ${title}, ${description}, ${formattedDueDate}::timestamp, ${statusValue}, ${requirementsJson}, 0, ${phaseId || null}, ${Boolean(allowLateSubmission)}, ${now}::timestamp, ${now}::timestamp)
    `;

    // Fetch the created milestone
    const newMilestone = await prisma.$queryRaw<MilestoneFromDB[]>`
      SELECT * FROM "Milestone" WHERE id = ${id}
    `;

    // Create notifications for all participants about the new milestone
    // Use a non-blocking approach to avoid Vercel timeout
    try {
      // Bulk fan-out to every participant (BCC-batched on the email side)
      await dispatchNotification({
        templateKey: 'newMilestoneAvailable',
        variables: { milestoneTitle: title },
        audience: { kind: 'allParticipants' },
        relatedEntityType: 'milestone',
        relatedEntityId: id,
      });
    } catch (notificationError) {
      console.error('Error creating milestone creation notifications:', notificationError);
      // Don't fail the milestone creation if notification fails
    }

    return NextResponse.json(
      {
        ...newMilestone[0],
        requirements: JSON.parse(newMilestone[0].requirements),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating milestone:", error);
    return NextResponse.json(
      { error: "Failed to create milestone" },
      { status: 500 }
    );
  }
}

// PUT /api/admin/milestones - Update a milestone
export async function PUT(request: NextRequest) {
  if (!requireAdmin(cookies().get("token")?.value)) return UNAUTHORIZED();
  try {
    const body = await request.json();
    const { id, title, description, dueDate, status, requirements, phaseId, allowLateSubmission } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Milestone ID is required" },
        { status: 400 }
      );
    }

    // Get the current milestone
    const currentMilestone = await prisma.$queryRaw<MilestoneFromDB[]>`
      SELECT * FROM "Milestone" WHERE id = ${id}
    `;

    if (currentMilestone.length === 0) {
      return NextResponse.json(
        { error: "Milestone not found" },
        { status: 404 }
      );
    }

    // Prepare update values
    const updatedTitle = title !== undefined ? title : currentMilestone[0].title;
    const updatedDescription = description !== undefined ? description : currentMilestone[0].description;
    const updatedDueDate = dueDate !== undefined ? new Date(dueDate).toISOString() : currentMilestone[0].dueDate.toISOString();
    const updatedStatus = status !== undefined ? status : currentMilestone[0].status;
    // undefined = leave alone; null = explicitly unlink the phase
    const updatedPhaseId =
      phaseId !== undefined ? (phaseId || null) : (currentMilestone[0] as any).phaseId ?? null;
    const updatedAllowLate =
      allowLateSubmission !== undefined
        ? Boolean(allowLateSubmission)
        : Boolean((currentMilestone[0] as any).allowLateSubmission);
    const updatedRequirements = requirements !== undefined 
      ? JSON.stringify(requirements) 
      : currentMilestone[0].requirements;
    const now = new Date().toISOString();

    // Update the milestone
    await prisma.$executeRaw`
      UPDATE "Milestone"
      SET title = ${updatedTitle},
          description = ${updatedDescription},
          "dueDate" = ${updatedDueDate}::timestamp,
          status = ${updatedStatus},
          requirements = ${updatedRequirements},
          "phaseId" = ${updatedPhaseId},
          "allowLateSubmission" = ${updatedAllowLate},
          "updatedAt" = ${now}::timestamp
      WHERE id = ${id}
    `;

    // Fetch the updated milestone
    const updatedMilestone = await prisma.$queryRaw<MilestoneFromDB[]>`
      SELECT * FROM "Milestone" WHERE id = ${id}
    `;

    return NextResponse.json({
      ...updatedMilestone[0],
      requirements: JSON.parse(updatedMilestone[0].requirements),
    });
  } catch (error) {
    console.error("Error updating milestone:", error);
    return NextResponse.json(
      { error: "Failed to update milestone" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/milestones - Delete a milestone
export async function DELETE(request: NextRequest) {
  if (!requireAdmin(cookies().get("token")?.value)) return UNAUTHORIZED();
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Milestone ID is required" },
        { status: 400 }
      );
    }

    // Check if milestone exists
    const milestone = await prisma.$queryRaw<MilestoneFromDB[]>`
      SELECT * FROM "Milestone" WHERE id = ${id}
    `;

    if (milestone.length === 0) {
      return NextResponse.json(
        { error: "Milestone not found" },
        { status: 404 }
      );
    }

    // First, check if there are any submissions for this milestone
    const submissions = await prisma.$queryRaw`
      SELECT COUNT(*) as count FROM "MilestoneSubmission" WHERE "milestoneId" = ${id}
    `;
    
    const submissionCount = Array.isArray(submissions) && submissions.length > 0 ? 
      Number(submissions[0].count) : 0;
    
    if (submissionCount > 0) {
      // Delete all associated submissions first
      await prisma.$executeRaw`
        DELETE FROM "MilestoneSubmission" WHERE "milestoneId" = ${id}
      `;
      
      console.log(`Deleted ${submissionCount} submissions for milestone ${id}`);
    }

    // Now it's safe to delete the milestone
    await prisma.$executeRaw`
      DELETE FROM "Milestone" WHERE id = ${id}
    `;

    return NextResponse.json(
      { message: "Milestone deleted successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error deleting milestone:", error);
    return NextResponse.json(
      { error: "Failed to delete milestone" },
      { status: 500 }
    );
  }
}
