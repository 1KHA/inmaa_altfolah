import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/notification-auth';
import { riyadhToday } from '@/lib/badge-dates';

export const dynamic = 'force-dynamic';

function displayName(p: {
  fullName: string | null;
  firstName: string | null;
  secondName: string | null;
  familyName: string | null;
  email: string;
}): string {
  return (
    p.fullName ||
    `${p.firstName ?? ''} ${p.secondName ?? ''} ${p.familyName ?? ''}`.trim() ||
    p.email
  );
}

const participantSelect = {
  id: true,
  email: true,
  fullName: true,
  firstName: true,
  secondName: true,
  familyName: true,
  team: { select: { teamName: true } },
} as const;

/**
 * GET — attendance tracking data.
 *
 *   ?mode=event&eventId=…  every registration with name/team/status/scan info + counts
 *   ?mode=general&date=…   the people scanned in that day + counts (date defaults to today)
 */
export async function GET(request: NextRequest) {
  if (!requireAdmin(cookies().get('token')?.value)) {
    return NextResponse.json(
      { error: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') === 'general' ? 'general' : 'event';

    // ---- general venue check-in ---------------------------------------------
    // Only the people actually scanned that day — not every registrant.
    if (mode === 'general') {
      const date = searchParams.get('date') || riyadhToday();

      const records = await prisma.attendanceRecord.findMany({
        where: { eventId: null, checkinDate: date },
        include: { participant: { select: participantSelect } },
        orderBy: { createdAt: 'desc' },
      });

      // scannedBy holds an admin or an organizer id — show who scanned
      const scannerIds = Array.from(new Set(records.map((r) => r.scannedBy)));
      const [admins, organizers] = await Promise.all([
        prisma.admin.findMany({ where: { id: { in: scannerIds } }, select: { id: true, username: true } }),
        prisma.organizer.findMany({ where: { id: { in: scannerIds } }, select: { id: true, name: true } }),
      ]);
      const scannerName = new Map<string, string>([
        ...admins.map((a) => [a.id, `مسؤول: ${a.username}`] as [string, string]),
        ...organizers.map((o) => [o.id, `منظم: ${o.name}`] as [string, string]),
      ]);

      const teams = new Set(records.map((r) => r.participant.team?.teamName).filter(Boolean));

      return NextResponse.json({
        mode: 'general',
        date,
        counts: {
          checkedIn: records.length,
          teams: teams.size,
          solo: records.filter((r) => !r.participant.team).length,
        },
        checkedIn: records.map((r) => ({
          participantId: r.participantId,
          name: displayName(r.participant),
          email: r.participant.email,
          teamName: r.participant.team?.teamName ?? null,
          time: r.createdAt,
          method: r.method,
          scannedBy: scannerName.get(r.scannedBy) ?? null,
        })),
      });
    }

    // ---- event attendance -----------------------------------------------------
    const eventId = searchParams.get('eventId');
    if (!eventId) {
      return NextResponse.json({ error: 'معرف الفعالية مطلوب' }, { status: 400 });
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, title: true, startDate: true, capacity: true },
    });
    if (!event) {
      return NextResponse.json({ error: 'الفعالية غير موجودة' }, { status: 404 });
    }

    const [registrations, scanRecords] = await Promise.all([
      prisma.eventRegistration.findMany({
        where: { eventId },
        include: { participant: { select: participantSelect } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.attendanceRecord.findMany({ where: { eventId } }),
    ]);

    const scanByParticipant = new Map(scanRecords.map((r) => [r.participantId, r]));

    const rows = registrations.map((reg) => {
      const scan = scanByParticipant.get(reg.participantId);
      return {
        registrationId: reg.id,
        participantId: reg.participantId,
        name: displayName(reg.participant),
        email: reg.participant.email,
        teamName: reg.participant.team?.teamName ?? null,
        status: reg.status,
        scannedAt: scan?.createdAt ?? null,
        method: scan?.method ?? null,
        scannedBy: scan?.scannedBy ?? null,
      };
    });

    // EventRegistration.status is the source of truth, so manual marking on the
    // events page counts too (its scannedAt simply stays null)
    const counts = {
      registered: rows.length,
      attended: rows.filter((r) => r.status === 'attended').length,
      absent: rows.filter((r) => r.status === 'absent').length,
      cancelled: rows.filter((r) => r.status === 'cancelled').length,
      remaining: rows.filter((r) => r.status === 'registered').length,
    };

    return NextResponse.json({
      mode: 'event',
      event: { id: event.id, title: event.title, startDate: event.startDate, capacity: event.capacity },
      counts,
      rows,
    });
  } catch (error) {
    console.error('Error fetching attendance:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
