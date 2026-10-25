import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { dispatchNotification } from '@/lib/notify';
import { getAppBaseUrl } from '@/lib/credentials';
import { getPracticeCard, isPracticeReviewable, PRACTICE_MAX_SCORE } from '@/lib/practice-cards';
import {
  ADMIN_REVIEWER_LABEL,
  getPracticeReviewer,
  practiceForReviewer,
  practiceLinks,
  practiceStatusOf,
  REVIEWS_NEWEST_FIRST,
} from '@/lib/practice';

export const dynamic = 'force-dynamic';

const COMMENT_MAX_LENGTH = 3000;

/**
 * Review a submitted card (admin or advisor).
 * Body: { decision: 'approved' | 'needs_revision', score: 1-5, comment }
 * The score of the latest review is the card's score. Sending a card back
 * reopens it for the team leader and notifies the whole team.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const reviewer = await getPracticeReviewer(request.cookies.get('token')?.value);
    if (reviewer instanceof NextResponse) return reviewer;

    const body = await request.json().catch(() => null);
    const decision = body?.decision;
    const score = Number(body?.score);
    const comment = typeof body?.comment === 'string' ? body.comment.trim().slice(0, COMMENT_MAX_LENGTH) : '';

    if (decision !== 'approved' && decision !== 'needs_revision') {
      return NextResponse.json({ error: 'اختر قرار المراجعة' }, { status: 400 });
    }
    if (!Number.isInteger(score) || score < 1 || score > PRACTICE_MAX_SCORE) {
      return NextResponse.json({ error: `اختر تقييماً من 1 إلى ${PRACTICE_MAX_SCORE}` }, { status: 400 });
    }
    if (decision === 'needs_revision' && !comment) {
      return NextResponse.json({ error: 'اكتب ملاحظاتك ليعرف الفريق ما المطلوب تعديله' }, { status: 400 });
    }

    const submission = await prisma.practiceSubmission.findUnique({
      where: { id: params.id },
      select: { id: true, teamId: true, cardKey: true, status: true, team: { select: { teamName: true } } },
    });
    const card = submission && getPracticeCard(submission.cardKey);
    if (!submission || !card) return NextResponse.json({ error: 'النموذج غير موجود' }, { status: 404 });

    if (!isPracticeReviewable(practiceStatusOf(submission.status))) {
      return NextResponse.json(
        { error: 'لا يمكن مراجعة النموذج الآن: لم يرسله الفريق للمراجعة بعد أو أعيد إليه للتعديل' },
        { status: 409 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Re-check the status inside the transaction: the card may have changed meanwhile
      const { count } = await tx.practiceSubmission.updateMany({
        where: { id: submission.id, status: { in: ['submitted', 'approved'] } },
        data: { status: decision, score, reviewedAt: new Date() },
      });
      if (count === 0) return null;
      await tx.practiceReview.create({
        data: {
          submissionId: submission.id,
          reviewerType: reviewer.type,
          reviewerId: reviewer.id,
          reviewerName: reviewer.name,
          decision,
          score,
          comment,
        },
      });
      return tx.practiceSubmission.findUnique({ where: { id: submission.id }, include: { reviews: REVIEWS_NEWEST_FIRST } });
    });

    if (!updated) {
      return NextResponse.json({ error: 'تغيرت حالة النموذج، حدّث الصفحة وحاول مرة أخرى' }, { status: 409 });
    }

    try {
      await dispatchNotification({
        templateKey: decision === 'needs_revision' ? 'practiceRevisionRequested' : 'practiceCardApproved',
        variables: {
          teamName: submission.team.teamName || 'فريق',
          cardTitle: card.title,
          // Absolute: it is read in an email
          cardUrl: `${getAppBaseUrl()}${practiceLinks.participant(card.key)}`,
          reviewerName: reviewer.type === 'admin' ? ADMIN_REVIEWER_LABEL : `المستشار ${reviewer.name}`,
          reviewComment: comment,
        },
        audience: { kind: 'team', teamId: submission.teamId },
        actionUrl: practiceLinks.participant(card.key),
        relatedEntityType: 'practice_submission',
        relatedEntityId: submission.id,
      });
    } catch (notifyError) {
      console.error('Error notifying the team of a practice review:', notifyError);
    }

    return NextResponse.json({ success: true, card: practiceForReviewer(updated) });
  } catch (error) {
    console.error('Error reviewing practice card:', error);
    return NextResponse.json({ error: 'تعذر حفظ المراجعة' }, { status: 500 });
  }
}
