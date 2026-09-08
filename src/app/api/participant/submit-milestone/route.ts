import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { dispatchNotification } from '@/lib/notify';
import { requireActiveParticipant, isEffectivelyDisabled, DISABLED_ACCOUNT_MESSAGE } from '@/lib/account-status';
import { evaluateSubmission } from '@/lib/milestones';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

interface JwtPayload {
  participantId: string;
  email: string;
  role: string;
  teamId?: string;
  isLeader?: boolean;
}


export async function POST(request: NextRequest) {
  try {
    // Get JSON body with file metadata (file already uploaded to Supabase)
    const body = await request.json();
    const { milestoneId, filePath, fileName } = body;

    // Validate inputs
    if (!milestoneId) {
      return NextResponse.json(
        { error: "معرف المرحلة مطلوب" },
        { status: 400 }
      );
    }

    if (!filePath || !fileName) {
      return NextResponse.json(
        { error: "معلومات الملف مطلوبة" },
        { status: 400 }
      );
    }

    // Get the participant ID from the JWT token
    const cookieStore = cookies();
    const tokenCookie = cookieStore.get('token'); // Changed from 'auth-token' to 'token' to match login route

    if (!tokenCookie) {
      console.log('No token cookie found in request');
      return NextResponse.json(
        { error: "يرجى تسجيل الدخول للتسليم" },
        { status: 401 }
      );
    }

    const token = tokenCookie.value;
    let decoded: JwtPayload;

    try {
      decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
      console.log('Decoded token:', decoded);
    } catch (err) {
      console.error('Token verification failed:', err);
      return NextResponse.json(
        { error: "جلسة غير صالحة، يرجى تسجيل الدخول مرة أخرى" },
        { status: 401 }
      );
    }

    // Get participantId directly from the decoded token
    const participantId = decoded.participantId;
    const blocked_ = await requireActiveParticipant(participantId);
    if (blocked_) return blocked_;


    // Get the participant with team information
    const participant = await prisma.participant.findUnique({
      where: { id: participantId },
      include: { team: true },
    });
    
    if (!participant) {
      return NextResponse.json(
        { error: "لم يتم العثور على المشارك" },
        { status: 404 }
      );
    }

    // Check if the participant is a team leader
    if (!participant.isLeader) {
      console.log(`Participant ${participantId} is not a team leader. isLeader=${participant.isLeader}`);
      return NextResponse.json(
        { error: "فقط قائد الفريق يمكنه تسليم المشاريع" },
        { status: 403 }
      );
    }

    // Check if the milestone exists
    const milestone = await prisma.$queryRaw`
      SELECT * FROM "Milestone" WHERE id = ${milestoneId}
    `;
    if (!milestone || (Array.isArray(milestone) && milestone.length === 0)) {
      return NextResponse.json(
        { error: "لم يتم العثور على المرحلة" },
        { status: 404 }
      );
    }

    const milestoneRow: any = Array.isArray(milestone) ? milestone[0] : milestone;

    const existing = await prisma.milestoneSubmission.findUnique({
      where: { participantId_milestoneId: { participantId: participant.id, milestoneId } },
      select: { id: true, reviewStatus: true, resubmissionDeadline: true, resubmissionCount: true },
    });

    // One rule for the deadline and the resubmission window, shared with
    // /api/milestones and the dashboards — see src/lib/milestones.ts.
    // This is the authoritative gate: the UI can be bypassed, this cannot.
    const verdict = evaluateSubmission({
      now: new Date(),
      milestone: {
        dueDate: new Date(milestoneRow.dueDate),
        allowLateSubmission: Boolean(milestoneRow.allowLateSubmission),
      },
      existing,
    });

    if (!verdict.canSubmit) {
      return NextResponse.json({ error: verdict.reason }, { status: 400 });
    }

    const now = new Date();
    if (existing) {
      // Resubmission: replace the file in place, so the
      // @@unique([participantId, milestoneId]) constraint still holds.
      // Only the newest file is kept (documented trade-off).
      await prisma.milestoneSubmission.update({
        where: { id: existing.id },
        data: {
          filePath,
          fileName,
          submittedAt: now,
          reviewStatus: 'pending',
          reviewComment: null,
          reviewedAt: null,
          resubmissionCount: { increment: 1 },
          isLate: verdict.isLate,
        },
      });
    } else {
      await prisma.milestoneSubmission.create({
        data: {
          participantId: participant.id,
          milestoneId,
          filePath,
          fileName,
          submittedAt: now,
          reviewStatus: 'pending',
          isLate: verdict.isLate,
        },
      });
      // Only a first submission counts; a resubmission is not a new one.
      await prisma.milestone.update({
        where: { id: milestoneId },
        data: { submissionCount: { increment: 1 } },
      });
    }

    // Create notification for admins about new milestone submission
    try {
      const milestoneData = Array.isArray(milestone) ? milestone[0] : milestone;
      await dispatchNotification({
        templateKey: 'newMilestoneSubmission',
        variables: {
          teamName: participant.team?.teamName || 'فريق غير محدد',
          milestoneTitle: milestoneData?.title || 'مرحلة غير محددة',
        },
        audience: { kind: 'admins' },
        relatedEntityType: 'milestone',
        relatedEntityId: milestoneId,
      });
    } catch (notificationError) {
      console.error('Error creating milestone submission notification:', notificationError);
      // Don't fail the submission if notification fails
    }

    return NextResponse.json({
      success: true,
      message: verdict.isResubmission ? "تم إعادة التسليم بنجاح" : "تم تسليم المشروع بنجاح",
      isResubmission: verdict.isResubmission,
      isLate: verdict.isLate,
    });
  } catch (error) {
    console.error("Error submitting milestone:", error);
    return NextResponse.json(
      { error: "حدث خطأ أثناء تسليم المشروع" },
      { status: 500 }
    );
  }
}
