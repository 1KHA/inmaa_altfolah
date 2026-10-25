import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getPracticeReviewer, practiceForReviewer, REVIEWS_NEWEST_FIRST } from '@/lib/practice';

export const dynamic = 'force-dynamic';

/** One team's cards for a reviewer (admin or advisor), with scores and review history. */
export async function GET(request: NextRequest, { params }: { params: { teamId: string } }) {
  try {
    const reviewer = await getPracticeReviewer(request.cookies.get('token')?.value);
    if (reviewer instanceof NextResponse) return reviewer;

    const team = await prisma.team.findUnique({
      where: { id: params.teamId },
      select: {
        id: true,
        teamName: true,
        status: true,
        ideaDescription: true,
        participants: {
          select: { id: true, fullName: true, isLeader: true },
          orderBy: [{ isLeader: 'desc' }, { createdAt: 'asc' }],
        },
        practiceSubmissions: { include: { reviews: REVIEWS_NEWEST_FIRST } },
      },
    });
    if (!team) return NextResponse.json({ error: 'الفريق غير موجود' }, { status: 404 });

    return NextResponse.json({
      reviewer: { type: reviewer.type, name: reviewer.name },
      team: {
        id: team.id,
        teamName: team.teamName || 'فريق',
        status: team.status,
        ideaDescription: team.ideaDescription,
        members: team.participants.map((p) => ({ id: p.id, fullName: p.fullName || '—', isLeader: p.isLeader })),
      },
      cards: Object.fromEntries(team.practiceSubmissions.map((s) => [s.cardKey, practiceForReviewer(s)])),
    });
  } catch (error) {
    console.error('Error loading team practice cards:', error);
    return NextResponse.json({ error: 'تعذر تحميل نماذج الفريق' }, { status: 500 });
  }
}
