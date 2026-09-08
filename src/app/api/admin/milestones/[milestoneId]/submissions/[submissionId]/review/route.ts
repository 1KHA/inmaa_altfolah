import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { autoAdvanceForMilestone, markFailedForMilestone } from "@/lib/phases";
import { dispatchNotification } from "@/lib/notify";
import { requireAdmin } from "@/lib/notification-auth";

// POST /api/admin/milestones/[milestoneId]/submissions/[submissionId]/review
// Updates the review status and comment for a submission
export async function POST(
  request: NextRequest,
  { params }: { params: { milestoneId: string; submissionId: string } }
) {
  if (!requireAdmin(cookies().get("token")?.value)) {
    return NextResponse.json({ error: "غير مصرح. هذه الخدمة متاحة للمسؤولين فقط." }, { status: 401 });
  }
  try {
    const { milestoneId, submissionId } = params;

    if (!milestoneId || !submissionId) {
      return NextResponse.json(
        { error: "معرف المرحلة ومعرف التسليم مطلوبان" },
        { status: 400 }
      );
    }

    // Get the review data from the request body
    const data = await request.json();
    const { reviewStatus, reviewComment } = data;

    if (!reviewStatus) {
      return NextResponse.json(
        { error: "حالة المراجعة مطلوبة" },
        { status: 400 }
      );
    }

    // Four outcomes: accept (advances a phase), reject (marks failed), request
    // a resubmission (re-opens the upload, no phase change), or 'pending' —
    // which the dialog has always offered as "undo my review" and which must
    // keep working; it moves nobody and notifies nobody.
    if (!['accepted', 'rejected', 'needs_resubmission', 'pending'].includes(reviewStatus)) {
      return NextResponse.json(
        { error: "حالة مراجعة غير صالحة" },
        { status: 400 }
      );
    }

    // Get submission details with participant, team, and milestone information
    const submissionDetails = await prisma.milestoneSubmission.findFirst({
      where: {
        id: submissionId,
        milestoneId: milestoneId,
      },
      include: {
        participant: {
          include: {
            team: true,
          },
        },
        milestone: true,
      },
    });

    if (!submissionDetails) {
      return NextResponse.json(
        { error: "لم يتم العثور على التسليم" },
        { status: 404 }
      );
    }

    // A resubmission request needs a comment — it is the only way the
    // participant learns what to fix.
    if (reviewStatus === 'needs_resubmission' && !String(reviewComment || '').trim()) {
      return NextResponse.json(
        { error: 'يرجى كتابة الملاحظات عند طلب إعادة التسليم' },
        { status: 400 }
      );
    }

    const resubmissionDeadline = data.resubmissionDeadline
      ? new Date(data.resubmissionDeadline)
      : null;

    await prisma.milestoneSubmission.update({
      where: { id: submissionId },
      data: {
        reviewStatus: reviewStatus,
        reviewComment: reviewComment || null,
        reviewedAt: new Date(),
        ...(reviewStatus === 'needs_resubmission'
          ? { resubmissionRequestedAt: new Date(), resubmissionDeadline }
          : {}),
      },
    });

    // --- phase movement -------------------------------------------------
    // Accepting advances the submitter's team (or the individual) to the next
    // phase, but ONLY when the milestone belongs to their current phase — that
    // makes re-saving a review idempotent. Rejecting marks them failed. Never
    // blocks the review itself.
    let phaseResult: { advanced: boolean; advancedTo?: string; reason?: string } = { advanced: false };
    if (reviewStatus === 'accepted') {
      phaseResult = await autoAdvanceForMilestone({
        milestonePhaseId: (submissionDetails.milestone as any).phaseId ?? null,
        teamId: submissionDetails.participant.teamId ?? null,
        participantId: submissionDetails.participant.id,
      });
    } else if (reviewStatus === 'rejected') {
      await markFailedForMilestone({
        teamId: submissionDetails.participant.teamId ?? null,
        participantId: submissionDetails.participant.id,
      });
    }
    // 'needs_resubmission' deliberately changes nothing: they stay in the
    // phase and are NOT marked failed.

    // Create notifications for team members about the review result
    try {
      if (submissionDetails.participant.teamId && reviewStatus !== 'pending') {
        await dispatchNotification({
          templateKey:
            reviewStatus === 'accepted'
              ? 'milestoneReviewAccepted'
              : reviewStatus === 'needs_resubmission'
                ? 'milestoneResubmissionRequested'
                : 'milestoneReviewRejected',
          variables: {
            milestoneTitle: submissionDetails.milestone.title,
            reviewComment: String(reviewComment || '').trim(),
            deadline: (resubmissionDeadline ?? submissionDetails.milestone.dueDate)
              .toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' }),
          },
          audience: { kind: 'team', teamId: submissionDetails.participant.teamId },
          relatedEntityType: 'milestone_submission',
          relatedEntityId: submissionId,
        });
      }
    } catch (notificationError) {
      console.error('Error creating milestone review notifications:', notificationError);
      // Don't fail the review if notification fails
    }

    return NextResponse.json({
      success: true,
      message: "تم تحديث المراجعة بنجاح",
      // reported so the admin sees the phase move in a toast rather than guessing
      phaseAdvanced: phaseResult.advanced,
      advancedTo: phaseResult.advancedTo,
      phaseReason: phaseResult.reason,
    });
  } catch (error) {
    console.error("Error updating submission review:", error);
    return NextResponse.json(
      { error: "حدث خطأ أثناء تحديث المراجعة" },
      { status: 500 }
    );
  }
}
