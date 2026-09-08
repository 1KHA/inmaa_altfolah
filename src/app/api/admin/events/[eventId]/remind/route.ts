import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/notification-auth';
import { dispatchNotification } from '@/lib/notify';
import { ACTIVE_PARTICIPANT_WHERE } from '@/lib/account-status';

export const dynamic = 'force-dynamic';

/**
 * Manual "إرسال تذكير" for an event, from the admin events page.
 *
 * GET  — preview for the confirmation dialog: how many people would be
 *        notified, and when a reminder was last sent.
 * POST — actually send (dashboard notification + email) to everyone still
 *        registered, then stamp Event.lastReminderAt.
 *
 * Both a confirmation dialog and this cooldown exist because a reminder is
 * irreversible and goes to everyone at once: the dialog stops an accidental
 * click, the cooldown stops a double-submit or a second admin repeating it
 * moments later. Pass { force: true } to send anyway.
 */

/**
 * A repeat send inside this window is refused unless the admin forces it.
 * Not exported: Next.js only permits specific exports from a route file.
 */
const REMINDER_COOLDOWN_MINUTES = 10;

async function countRecipients(eventId: string): Promise<number> {
  return prisma.eventRegistration.count({
    where: { eventId, status: 'registered', participant: ACTIVE_PARTICIPANT_WHERE },
  });
}

function unauthorized() {
  return NextResponse.json(
    { error: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' },
    { status: 401 }
  );
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  if (!requireAdmin(cookies().get('token')?.value)) return unauthorized();

  try {
    const event = await prisma.event.findUnique({
      where: { id: params.eventId },
      select: { id: true, title: true, lastReminderAt: true },
    });
    if (!event) return NextResponse.json({ error: 'الفعالية غير موجودة' }, { status: 404 });

    return NextResponse.json({
      eventTitle: event.title,
      recipientCount: await countRecipients(event.id),
      lastReminderAt: event.lastReminderAt,
      cooldownMinutes: REMINDER_COOLDOWN_MINUTES,
    });
  } catch (error) {
    console.error('Error previewing event reminder:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  if (!requireAdmin(cookies().get('token')?.value)) return unauthorized();

  try {
    const body = await request.json().catch(() => ({}));
    const force = body?.force === true;

    const event = await prisma.event.findUnique({
      where: { id: params.eventId },
      select: { id: true, title: true, startDate: true, location: true, lastReminderAt: true },
    });
    if (!event) return NextResponse.json({ error: 'الفعالية غير موجودة' }, { status: 404 });

    // Cooldown — guards against a double-click, a double-submit, or a second
    // admin repeating the send moments later.
    if (!force && event.lastReminderAt) {
      const minutesAgo = (Date.now() - event.lastReminderAt.getTime()) / 60000;
      if (minutesAgo < REMINDER_COOLDOWN_MINUTES) {
        return NextResponse.json(
          {
            error: `تم إرسال تذكير لهذه الفعالية قبل ${Math.max(1, Math.round(minutesAgo))} دقيقة. أعد المحاولة لاحقاً أو أكّد الإرسال مرة أخرى.`,
            cooldown: true,
            lastReminderAt: event.lastReminderAt,
          },
          { status: 409 }
        );
      }
    }

    // Counted first so the admin gets an honest number and an empty event
    // fails loudly instead of silently doing nothing.
    const recipientCount = await countRecipients(event.id);
    if (recipientCount === 0) {
      return NextResponse.json(
        { success: false, recipientCount: 0, error: 'لا يوجد مشاركون مسجلون في هذه الفعالية' },
        { status: 400 }
      );
    }

    const eventDate = new Intl.DateTimeFormat('ar-SA', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'Asia/Riyadh',
    }).format(event.startDate);

    await dispatchNotification({
      templateKey: 'eventReminderManual',
      variables: {
        eventTitle: event.title,
        eventDate,
        eventLocation: event.location || 'غير محدد',
      },
      audience: { kind: 'eventRegistrants', eventId: event.id },
      relatedEntityType: 'event',
      relatedEntityId: event.id,
    });

    await prisma.event.update({
      where: { id: event.id },
      data: { lastReminderAt: new Date() },
    });

    console.log(`[events] reminder for "${event.title}" dispatched to ${recipientCount} participant(s)${force ? ' (forced)' : ''}`);
    return NextResponse.json({ success: true, recipientCount, forced: force });
  } catch (error) {
    console.error('Error sending event reminder:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
