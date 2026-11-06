import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireOrganizer } from '@/lib/organizer-auth';
import { ELIGIBLE_PARTICIPANT_WHERE } from '@/lib/account-status';
import { riyadhToday } from '@/lib/badge-dates';

export const dynamic = 'force-dynamic';

const MAX_RESULTS = 50;

/**
 * GET ?q=… — read-only participant lookup for organizers.
 *
 * Active participants only (approved and not disabled — the same rule login
 * uses). Every word of the query must match the name, email or team name.
 * Returns only what the door needs: name, team, email and today's check-in;
 * never badge codes (that would allow a check-in without the badge), phone or
 * ID numbers.
 */
export async function GET(request: NextRequest) {
  const organizer = await requireOrganizer(cookies().get('token')?.value);
  if (!organizer) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  }

  try {
    const q = (new URL(request.url).searchParams.get('q') || '').trim();
    const today = riyadhToday();
    if (q.length < 2) {
      return NextResponse.json({ today, results: [], truncated: false });
    }

    const words = q.split(/\s+/).filter(Boolean).slice(0, 5);
    const wordMatch = (w: string): Prisma.ParticipantWhereInput => ({
      OR: [
        { fullName: { contains: w, mode: 'insensitive' } },
        { firstName: { contains: w, mode: 'insensitive' } },
        { secondName: { contains: w, mode: 'insensitive' } },
        { familyName: { contains: w, mode: 'insensitive' } },
        { email: { contains: w, mode: 'insensitive' } },
        { team: { is: { teamName: { contains: w, mode: 'insensitive' } } } },
      ],
    });

    const rows = await prisma.participant.findMany({
      where: { AND: [ELIGIBLE_PARTICIPANT_WHERE, ...words.map(wordMatch)] },
      select: {
        id: true,
        email: true,
        fullName: true,
        firstName: true,
        secondName: true,
        familyName: true,
        team: { select: { teamName: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: MAX_RESULTS + 1,
    });
    const truncated = rows.length > MAX_RESULTS;
    const shown = rows.slice(0, MAX_RESULTS);

    const checkins = await prisma.attendanceRecord.findMany({
      where: { participantId: { in: shown.map((r) => r.id) }, eventId: null, checkinDate: today },
      select: { participantId: true, createdAt: true },
    });
    const checkedInAt = new Map(checkins.map((c) => [c.participantId, c.createdAt]));

    return NextResponse.json({
      today,
      truncated,
      results: shown.map((p) => ({
        participantId: p.id,
        name:
          p.fullName ||
          `${p.firstName ?? ''} ${p.secondName ?? ''} ${p.familyName ?? ''}`.trim() ||
          p.email,
        email: p.email,
        teamName: p.team?.teamName ?? null,
        checkedInToday: checkedInAt.has(p.id),
        checkedInAt: checkedInAt.get(p.id) ?? null,
      })),
    });
  } catch (error) {
    console.error('Error searching participants for organizer:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
