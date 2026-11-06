import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/notification-auth';
import { findBadgeHolder, checkInGeneral, notifyAttendance } from '@/lib/general-checkin';

export const dynamic = 'force-dynamic';

/**
 * POST — record attendance from a scanned (or manually entered) badge code.
 *
 * body: { badgeCode, mode: 'event' | 'general', eventId?, method?: 'scan' | 'manual' }
 *
 * Event mode (strict door policy, per user decision):
 *   unknown badge          -> 404
 *   not registered         -> 409 (nothing written)
 *   registration cancelled -> 409
 *   already attended       -> 200 { alreadyAttended: true }
 *   registered             -> attended + audit row
 *   absent                 -> attended + audit row + { wasAbsent: true }
 *
 * General mode: one check-in per participant per day (Asia/Riyadh).
 * Every response carries the participant identity for the door display.
 */
export async function POST(request: NextRequest) {
  const adminId = requireAdmin(cookies().get('token')?.value);
  if (!adminId) {
    return NextResponse.json(
      { error: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const badgeCode = String(body.badgeCode || '').trim().toUpperCase();
    const mode = body.mode === 'general' ? 'general' : 'event';
    const method = body.method === 'manual' ? 'manual' : 'scan';
    const eventId = body.eventId ? String(body.eventId) : null;

    if (!badgeCode) {
      return NextResponse.json({ error: 'رمز البطاقة مطلوب' }, { status: 400 });
    }
    if (mode === 'event' && !eventId) {
      return NextResponse.json({ error: 'يرجى اختيار الفعالية أولاً' }, { status: 400 });
    }

    const identity = await findBadgeHolder(badgeCode);
    if (!identity) {
      return NextResponse.json({ error: 'بطاقة غير معروفة — تحقق من الرمز' }, { status: 404 });
    }
    const participant = { id: identity.participantId };

    // ---- general venue check-in ---------------------------------------------
    if (mode === 'general') {
      // same-day duplicate comes back as result 'alreadyCheckedIn' — not an error at the door
      const outcome = await checkInGeneral({ participantId: participant.id, scannedBy: adminId, method });
      return NextResponse.json({ success: true, ...outcome, ...identity });
    }

    // ---- event attendance -----------------------------------------------------
    const event = await prisma.event.findUnique({
      where: { id: eventId! },
      select: { id: true, title: true },
    });
    if (!event) {
      return NextResponse.json({ error: 'الفعالية غير موجودة' }, { status: 404 });
    }

    const registration = await prisma.eventRegistration.findUnique({
      where: { participantId_eventId: { participantId: participant.id, eventId: event.id } },
    });

    if (!registration) {
      // strict policy: reject, record nothing
      return NextResponse.json(
        { error: 'غير مسجل في هذه الفعالية', result: 'notRegistered', ...identity },
        { status: 409 }
      );
    }

    if (registration.status === 'cancelled') {
      return NextResponse.json(
        { error: 'تسجيله في هذه الفعالية ملغى', result: 'cancelled', ...identity },
        { status: 409 }
      );
    }

    if (registration.status === 'attended') {
      return NextResponse.json({
        success: true,
        result: 'alreadyAttended',
        eventTitle: event.title,
        ...identity,
      });
    }

    const wasAbsent = registration.status === 'absent';

    await prisma.$transaction([
      prisma.eventRegistration.update({
        where: { id: registration.id },
        data: { status: 'attended' },
      }),
      prisma.attendanceRecord.upsert({
        // both keys non-null here, so the composite selector is usable;
        // upsert covers a re-scan after an undo left no registration change
        where: { participantId_eventId: { participantId: participant.id, eventId: event.id } },
        create: {
          participantId: participant.id,
          eventId: event.id,
          scannedBy: adminId,
          method,
        },
        update: { scannedBy: adminId, method, createdAt: new Date() },
      }),
    ]);

    await notifyAttendance(participant.id, event.title);

    return NextResponse.json({
      success: true,
      result: 'attended',
      wasAbsent,
      eventTitle: event.title,
      ...identity,
    });
  } catch (error) {
    console.error('Error recording attendance:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
