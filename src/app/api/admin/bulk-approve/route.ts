import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { waitUntil } from '@vercel/functions';
import { requireAdmin } from '@/lib/notification-auth';
import { createBulkJob, runBulkJobChunk, getBulkJob, countPending, type BulkTarget } from '@/lib/bulk-approval';
import { drainEmailQueue } from '@/lib/email-queue';

/**
 * Bulk acceptance of pending teams / individual participants.
 *
 *   POST { target: 'teams'|'participants', ids?: string[] }  → create job + run first chunk
 *   POST { jobId }                                             → run the next chunk
 *   GET  ?jobId=                                               → progress
 *   GET  ?target=teams|participants[&ids=a,b,c]                → how many are pending
 *
 * Each chunk approves for at most CHUNK_BUDGET_MS and returns; the admin UI
 * loops until `done`. Emails are queued, never sent inside the request — the
 * last chunk kicks an inline drain (waitUntil) and the cron/drain endpoint
 * finish whatever is left. See mdfiles/bulk-approval.md.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
/** Approval work per request; well under the 30 s default function cap. */
const CHUNK_BUDGET_MS = 8_000;
/** Inline drain after the last chunk (leaves headroom under maxDuration). */
const INLINE_DRAIN_BUDGET_MS = 240_000;

const UNAUTHORIZED = () =>
  NextResponse.json({ error: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' }, { status: 401 });

const isTarget = (v: unknown): v is BulkTarget => v === 'teams' || v === 'participants';

export async function GET(request: NextRequest) {
  if (!requireAdmin(cookies().get('token')?.value)) return UNAUTHORIZED();
  try {
    const jobId = request.nextUrl.searchParams.get('jobId');
    if (jobId) {
      const progress = await getBulkJob(jobId);
      if (!progress) return NextResponse.json({ error: 'المهمة غير موجودة' }, { status: 404 });
      return NextResponse.json(progress);
    }
    const target = request.nextUrl.searchParams.get('target');
    if (!isTarget(target)) return NextResponse.json({ error: 'target غير صالح' }, { status: 400 });
    const idsParam = request.nextUrl.searchParams.get('ids');
    const ids = idsParam ? idsParam.split(',').filter(Boolean) : null;
    return NextResponse.json({ target, pending: await countPending(target, ids) });
  } catch (error) {
    console.error('[bulk-approve] GET failed:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const adminId = requireAdmin(cookies().get('token')?.value);
  if (!adminId) return UNAUTHORIZED();
  try {
    const body = await request.json().catch(() => ({}));
    let jobId: string | undefined = typeof body.jobId === 'string' ? body.jobId : undefined;

    if (!jobId) {
      if (!isTarget(body.target)) return NextResponse.json({ error: 'target غير صالح' }, { status: 400 });
      let ids: string[] | null = null;
      if (Array.isArray(body.ids)) {
        ids = Array.from(new Set(body.ids.filter((x: unknown) => typeof x === 'string' && x)));
        if (ids!.length === 0) return NextResponse.json({ error: 'لم يتم تحديد أي عنصر' }, { status: 400 });
      }
      const created = await createBulkJob(adminId, body.target, ids);
      jobId = created.jobId;
    }

    const progress = await runBulkJobChunk(jobId, CHUNK_BUDGET_MS);
    if (!progress) return NextResponse.json({ error: 'المهمة غير موجودة' }, { status: 404 });

    if (progress.done && progress.emails.total > 0) {
      // Approvals finished: start delivering the queued emails right away.
      // Overlapping drainers (cron, the admin drain endpoint) are safe — rows
      // are claimed with SKIP LOCKED.
      try {
        waitUntil(
          drainEmailQueue({ budgetMs: INLINE_DRAIN_BUDGET_MS }).catch((err) =>
            console.error('[bulk-approve] inline drain failed:', err)
          )
        );
      } catch {
        // Not on Vercel (local/Docker): the drain endpoint + cron take over.
      }
    }
    return NextResponse.json(progress);
  } catch (error) {
    console.error('[bulk-approve] POST failed:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
