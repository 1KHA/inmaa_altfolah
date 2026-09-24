import { NextRequest, NextResponse } from 'next/server';
import { sendDueBookingReminders } from '@/lib/booking-reminders';

/**
 * GET — cron entry point (vercel.json → every minute; the Docker entrypoint
 * polls it locally). Sends the 5-minute-before reminders for bookings that
 * are about to start. `401` unless `Authorization: Bearer $CRON_SECRET`
 * (fails closed when the secret is unset), same as the email-queue cron.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  }
  try {
    const result = await sendDueBookingReminders();
    if (result.reminded > 0) console.log('[cron] booking-reminders', JSON.stringify(result));
    return NextResponse.json(result);
  } catch (error) {
    console.error('[cron] booking-reminders failed:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
