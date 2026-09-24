import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireAdmin } from '@/lib/notification-auth';
import { drainEmailQueue } from '@/lib/email-queue';

/**
 * POST — admin-triggered drain of the email queue (one bounded pass).
 *
 * The bulk-acceptance progress dialog calls this repeatedly until the queue
 * is empty, so delivery does not depend on the Vercel cron (per-minute cron
 * needs Pro) or on the inline drainer surviving. Calls are sequential from
 * the UI and safe to overlap with other drainers (SKIP LOCKED claims).
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
/** Per-call budget; leaves headroom under maxDuration for the last send. */
const DRAIN_BUDGET_MS = 20_000;

export async function POST() {
  if (!requireAdmin(cookies().get('token')?.value)) {
    return NextResponse.json({ error: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' }, { status: 401 });
  }
  try {
    const result = await drainEmailQueue({ budgetMs: DRAIN_BUDGET_MS });
    return NextResponse.json(result);
  } catch (error) {
    console.error('[email-queue/drain] failed:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
