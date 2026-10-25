import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getPracticeReviewer, practiceStatusOf } from '@/lib/practice';
import { PRACTICE_CARDS, getPracticeCard } from '@/lib/practice-cards';

export const dynamic = 'force-dynamic';

/**
 * Reviewer overview (admins and advisors): every accepted team with each
 * card's status and score, plus the queue of cards waiting for review
 * (oldest submission first).
 */
export async function GET(request: NextRequest) {
  try {
    const reviewer = await getPracticeReviewer(request.cookies.get('token')?.value);
    if (reviewer instanceof NextResponse) return reviewer;

    const teams = await prisma.team.findMany({
      where: { status: 'approved' },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        teamName: true,
        isDisabled: true,
        _count: { select: { participants: true } },
        practiceSubmissions: {
          select: { id: true, cardKey: true, status: true, score: true, submitCount: true, submittedAt: true, reviewedAt: true },
        },
      },
    });

    const queue: {
      submissionId: string;
      teamId: string;
      teamName: string;
      cardKey: string;
      cardNumber: number;
      cardTitle: string;
      submitCount: number;
      submittedAt: Date | null;
    }[] = [];

    const rows = teams.map((team) => {
      const cards: Record<string, { status: string; score: number | null; submittedAt: Date | null }> = {};
      let totalScore = 0;
      let scoredCount = 0;
      let approvedCount = 0;
      let submittedCount = 0;
      let pendingCount = 0;

      for (const sub of team.practiceSubmissions) {
        const card = getPracticeCard(sub.cardKey);
        if (!card) continue;
        const status = practiceStatusOf(sub.status);
        cards[sub.cardKey] = { status, score: sub.score, submittedAt: sub.submittedAt };
        if (sub.score != null) {
          totalScore += sub.score;
          scoredCount += 1;
        }
        if (status === 'approved') approvedCount += 1;
        if (sub.submitCount > 0) submittedCount += 1;
        if (status === 'submitted') {
          pendingCount += 1;
          queue.push({
            submissionId: sub.id,
            teamId: team.id,
            teamName: team.teamName || 'فريق',
            cardKey: sub.cardKey,
            cardNumber: card.number,
            cardTitle: card.title,
            submitCount: sub.submitCount,
            submittedAt: sub.submittedAt,
          });
        }
      }

      return {
        id: team.id,
        teamName: team.teamName || 'فريق',
        isDisabled: team.isDisabled,
        membersCount: team._count.participants,
        cards,
        totalScore,
        scoredCount,
        approvedCount,
        submittedCount,
        pendingCount,
      };
    });

    queue.sort((a, b) => (a.submittedAt?.getTime() ?? 0) - (b.submittedAt?.getTime() ?? 0));

    return NextResponse.json({
      reviewer: { type: reviewer.type, name: reviewer.name },
      cards: PRACTICE_CARDS.map((c) => ({ key: c.key, number: c.number, title: c.title })),
      teams: rows,
      queue,
    });
  } catch (error) {
    console.error('Error loading practice overview:', error);
    return NextResponse.json({ error: 'تعذر تحميل النماذج' }, { status: 500 });
  }
}
