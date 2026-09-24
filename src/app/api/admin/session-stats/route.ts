import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/notification-auth';

/**
 * GET — session counters per participant, per team and per mentor (admin).
 *
 *   booked    non-cancelled bookings (incl. completed)
 *   joined    bookings where THAT side opened the meeting link
 *             (participant side: participantJoinedAt; mentor side: mentorJoinedAt)
 *   completed bookings where both sides joined (status = completed)
 *
 * Team counters are the sum over its members. Mentor counters are the
 * bookings on the mentor's own slots (organization bookings count for the
 * slot owner). See Meeting_Trigger.md.
 */
export const dynamic = 'force-dynamic';

export interface SessionCounts { booked: number; joined: number; completed: number }

export async function GET() {
  if (!requireAdmin(cookies().get('token')?.value)) {
    return NextResponse.json({ error: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' }, { status: 401 });
  }
  try {
    const rows = await prisma.mentorBooking.findMany({
      where: { status: { not: 'cancelled' } },
      select: {
        status: true,
        mentorJoinedAt: true,
        participantJoinedAt: true,
        participant: { select: { id: true, teamId: true } },
        availability: { select: { mentorId: true } },
      },
    });
    const participants: Record<string, SessionCounts> = {};
    const teams: Record<string, SessionCounts> = {};
    const mentors: Record<string, SessionCounts> = {};
    const bump = (map: Record<string, SessionCounts>, key: string, joined: boolean, completed: boolean) => {
      const c = (map[key] ??= { booked: 0, joined: 0, completed: 0 });
      c.booked++;
      if (joined) c.joined++;
      if (completed) c.completed++;
    };
    for (const r of rows) {
      const completed = r.status === 'completed';
      bump(participants, r.participant.id, !!r.participantJoinedAt, completed);
      if (r.participant.teamId) bump(teams, r.participant.teamId, !!r.participantJoinedAt, completed);
      bump(mentors, r.availability.mentorId, !!r.mentorJoinedAt, completed);
    }
    return NextResponse.json({ participants, teams, mentors, total: rows.length });
  } catch (error) {
    console.error('[session-stats] failed:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
