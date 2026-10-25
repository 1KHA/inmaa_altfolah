import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getPracticeParticipant, practiceForParticipant, REVIEWS_NEWEST_FIRST } from '@/lib/practice';

export const dynamic = 'force-dynamic';

/**
 * The signed-in participant's team cards: answers, status and reviewers'
 * comments (never the scores). Every member may read; only the leader writes
 * (PUT ./[cardKey]).
 */
export async function GET(request: NextRequest) {
  try {
    const me = await getPracticeParticipant(request.cookies.get('token')?.value);
    if (me instanceof NextResponse) return me;

    const submissions = await prisma.practiceSubmission.findMany({
      where: { teamId: me.teamId },
      include: { reviews: REVIEWS_NEWEST_FIRST },
    });

    return NextResponse.json({
      teamName: me.teamName,
      isLeader: me.isLeader,
      cards: Object.fromEntries(submissions.map((s) => [s.cardKey, practiceForParticipant(s)])),
    });
  } catch (error) {
    console.error('Error loading practice cards:', error);
    return NextResponse.json({ error: 'تعذر تحميل النماذج' }, { status: 500 });
  }
}
