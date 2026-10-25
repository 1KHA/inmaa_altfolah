import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { dispatchNotification } from '@/lib/notify';
import { getPracticeCard, isPracticeEditable, sanitizePracticeAnswers } from '@/lib/practice-cards';
import {
  getPracticeParticipant,
  practiceForParticipant,
  practiceLinks,
  practiceStatusOf,
  REVIEWS_NEWEST_FIRST,
} from '@/lib/practice';

export const dynamic = 'force-dynamic';

/**
 * Save the team's answers to one card (team leader only).
 * Body: { answers: { [fieldKey]: string }, submit?: boolean }
 *  - submit false: keep as a draft (a card sent back stays "needs_revision")
 *  - submit true: send for review; the card is locked until a reviewer acts
 */
export async function PUT(request: NextRequest, { params }: { params: { cardKey: string } }) {
  try {
    const card = getPracticeCard(params.cardKey);
    if (!card) return NextResponse.json({ error: 'النموذج غير موجود' }, { status: 404 });

    const me = await getPracticeParticipant(request.cookies.get('token')?.value);
    if (me instanceof NextResponse) return me;
    if (!me.isLeader) {
      return NextResponse.json({ error: 'فقط قائد الفريق يمكنه تعبئة النماذج وإرسالها' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const submit = body?.submit === true;
    const answers = sanitizePracticeAnswers(card, body?.answers);

    const where = { teamId_cardKey: { teamId: me.teamId, cardKey: card.key } };
    const existing = await prisma.practiceSubmission.findUnique({ where, select: { status: true } });
    const status = practiceStatusOf(existing?.status);

    if (!isPracticeEditable(status)) {
      return NextResponse.json(
        { error: status === 'approved' ? 'تم اعتماد هذا النموذج ولا يمكن تعديله' : 'النموذج قيد المراجعة ولا يمكن تعديله حتى تصل ملاحظات المراجع' },
        { status: 409 }
      );
    }
    if (submit && Object.keys(answers).length === 0) {
      return NextResponse.json({ error: 'اكتب إجاباتك قبل إرسال النموذج' }, { status: 400 });
    }

    const now = new Date();
    const data = submit
      ? { answers: JSON.stringify(answers), status: 'submitted', submittedAt: now, submittedById: me.id }
      : { answers: JSON.stringify(answers), status: status === 'needs_revision' ? 'needs_revision' : 'draft' };

    const saved = await prisma.practiceSubmission.upsert({
      where,
      create: { teamId: me.teamId, cardKey: card.key, ...data, submitCount: submit ? 1 : 0 },
      update: { ...data, ...(submit ? { submitCount: { increment: 1 } } : {}) },
      include: { reviews: REVIEWS_NEWEST_FIRST },
    });

    if (submit) {
      // Reviewers hear about every submission (dashboard only unless an admin enables email)
      const variables = { teamName: me.teamName, cardTitle: card.title };
      const related = { relatedEntityType: 'practice_submission', relatedEntityId: saved.id };
      try {
        await dispatchNotification({
          templateKey: 'practiceCardSubmitted',
          variables,
          audience: { kind: 'admins' },
          actionUrl: practiceLinks.admin(me.teamId, card.key),
          ...related,
        });
        await dispatchNotification({
          templateKey: 'practiceCardSubmittedAdvisor',
          variables,
          audience: { kind: 'advisors' },
          actionUrl: practiceLinks.advisor(me.teamId, card.key),
          ...related,
        });
      } catch (notifyError) {
        console.error('Error notifying reviewers of a practice card:', notifyError);
      }
    }

    return NextResponse.json({ success: true, card: practiceForParticipant(saved) });
  } catch (error) {
    console.error('Error saving practice card:', error);
    return NextResponse.json({ error: 'تعذر حفظ النموذج' }, { status: 500 });
  }
}
