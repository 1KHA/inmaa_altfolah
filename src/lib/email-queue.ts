/**
 * Persistent, resumable email queue for broadcasts.
 *
 * The broadcast POST no longer sends inside the request. It writes one
 * BroadcastRecipient row per email recipient (status=pending) and returns.
 * Two drainers then work the queue, both calling drainEmailQueue():
 *   1. inline, right after the response, via waitUntil() — so a normal
 *      broadcast finishes within seconds without waiting for the cron;
 *   2. Vercel Cron (GET /api/cron/drain-email-queue, every minute) — picks up
 *      anything the inline drainer did not finish (function killed, provider
 *      down, retries due), so a broadcast can never be silently abandoned.
 *
 * Safety properties (verified by scripts/tests/queue-integration.js):
 *   - a recipient is sent at most once: rows are claimed atomically with
 *     `FOR UPDATE SKIP LOCKED`, so overlapping drainers never take the same row;
 *   - transport-level failures (API down, network) are retried with backoff up
 *     to QUEUE_MAX_ATTEMPTS; provider rejections (hard-bounce, invalid) are
 *     permanent and never retried;
 *   - a drainer that dies mid-slice leaves rows in `sending`; they are
 *     re-claimed after STALE_CLAIM_MS;
 *   - Broadcast.emailSentCount / emailFailedCount / status are recomputed from
 *     the rows after every batch, so the admin table is always consistent.
 *
 * Design doc: mdfiles/email-queue.md
 */
import { prisma } from './prisma';
import {
  getEmailSettings,
  toSmtpConfig,
  chunkRecipients,
  getIndividualBatchSize,
  type SmtpConfig,
  type SendEmailResult,
  type EmailAudience,
  type IndividualEmail,
} from './mailer';
import { sendRawEmail, stampEmailStatus } from './notify';

export const QUEUE_MAX_ATTEMPTS = 3;
/** A `sending` row older than this is assumed orphaned by a dead drainer. */
export const STALE_CLAIM_MS = 10 * 60_000;
/** Rows claimed per claim query. Chunked further by the transport batch size. */
export const DEFAULT_SLICE_SIZE = 500;
/** Backoff before retrying a transport-level failure: attempt n waits n minutes. */
const RETRY_BACKOFF_MS = 60_000;

/** Shared-inbox admin row: one row per broadcast, notifications stamped by broadcast. */
export const ADMIN_INBOX_RECIPIENT_ID = 'shared-inbox';

export interface QueueRecipientInput {
  recipientType: 'participant' | 'mentor' | 'admin';
  recipientId: string;
  email: string;
  notificationId?: string | null;
  /** Per-recipient rendered content (credentials). Sent one-by-one, never BCC. */
  subject?: string | null;
  body?: string | null;
}

export interface QueueRow {
  id: string;
  broadcastId: string;
  recipientType: string;
  recipientId: string;
  email: string;
  notificationId: string | null;
  status: string;
  attempts: number;
  /** Non-null => this row has its own content and is sent individually. */
  subject: string | null;
  body: string | null;
}

export interface DrainOptions {
  /** Wall-clock budget; the drainer stops claiming/sending once exceeded. */
  budgetMs: number;
  sliceSize?: number;
  /** Test seam: replaces the real transport. */
  send?: SendFn;
  /** Test seam: injectable clock. */
  now?: () => number;
}

export interface DrainResult {
  claimed: number;
  sent: number;
  failed: number;
  retried: number;
  /** Rows released back to pending because the budget ran out. */
  released: number;
  /** Rows still pending/sending after this run. */
  remaining: number;
  broadcastIds: string[];
  /** Why the run ended. */
  stoppedBy: 'empty' | 'budget' | 'email-disabled';
}

export type SendFn = (params: {
  config: SmtpConfig;
  /** Per-recipient content batch (credentials); `bcc` is empty then. */
  items?: IndividualEmail[];
  bcc: string[];
  subject: string;
  bodyText: string;
  broadcastId: string;
  /** Footer support channels; set when every row in the batch shares a recipient type. */
  audience?: EmailAudience;
}) => Promise<SendEmailResult>;

function isSqlite(): boolean {
  return process.env.DATABASE_TYPE === 'sqlite';
}

/**
 * Insert the recipient rows for a broadcast. Duplicate emails within one
 * broadcast collapse to a single row (unique index + skipDuplicates).
 * Returns the number of rows actually queued.
 */
export async function enqueueBroadcastRecipients(
  broadcastId: string,
  recipients: QueueRecipientInput[]
): Promise<number> {
  if (recipients.length === 0) return 0;
  const result = await prisma.broadcastRecipient.createMany({
    data: recipients.map((r) => ({
      broadcastId,
      recipientType: r.recipientType,
      recipientId: r.recipientId,
      email: r.email.trim(),
      notificationId: r.notificationId ?? null,
      subject: r.subject ?? null,
      body: r.body ?? null,
    })),
    skipDuplicates: true,
  });
  await prisma.broadcast.update({
    where: { id: broadcastId },
    data: { totalRecipients: { increment: result.count }, status: 'queued' },
  });
  return result.count;
}

/**
 * Atomically claim up to `limit` rows that are due: pending (and past their
 * retry time) or stale `sending` rows abandoned by a dead drainer.
 *
 * Postgres: one UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED)
 * RETURNING — concurrent drainers skip each other's rows instead of blocking
 * or double-claiming. SQLite (local dev only) has a single writer, so a plain
 * select-then-update is equivalent there.
 */
export async function claimSlice(limit: number, nowMs: number = Date.now()): Promise<QueueRow[]> {
  const now = new Date(nowMs);
  const staleBefore = new Date(nowMs - STALE_CLAIM_MS);

  if (isSqlite()) {
    const due = await prisma.broadcastRecipient.findMany({
      where: {
        OR: [
          { status: 'pending', OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
          { status: 'sending', claimedAt: { lt: staleBefore } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true },
    });
    if (due.length === 0) return [];
    const ids = due.map((r) => r.id);
    await prisma.broadcastRecipient.updateMany({
      where: { id: { in: ids } },
      data: { status: 'sending', claimedAt: now },
    });
    return prisma.broadcastRecipient.findMany({
      where: { id: { in: ids } },
      select: QUEUE_ROW_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  // Prisma stores DateTime in `timestamp(3)` (no zone) as UTC. A JS Date
  // bound into $queryRaw arrives as timestamptz and Postgres would convert it
  // with the SESSION time zone — 3h off on a non-UTC server, which made fresh
  // claims look stale and skipped retry backoff. Bind ISO strings and cast
  // explicitly so the comparison is UTC-to-UTC regardless of server zone.
  const nowIso = now.toISOString();
  const staleIso = staleBefore.toISOString();
  return prisma.$queryRaw<QueueRow[]>`
    UPDATE "BroadcastRecipient"
    SET "status" = 'sending',
        "claimedAt" = (${nowIso}::timestamptz AT TIME ZONE 'UTC')
    WHERE "id" IN (
      SELECT "id" FROM "BroadcastRecipient"
      WHERE ("status" = 'pending'
             AND ("nextAttemptAt" IS NULL
                  OR "nextAttemptAt" <= (${nowIso}::timestamptz AT TIME ZONE 'UTC')))
         OR ("status" = 'sending'
             AND "claimedAt" < (${staleIso}::timestamptz AT TIME ZONE 'UTC'))
      ORDER BY "createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "broadcastId", "recipientType", "recipientId", "email", "notificationId", "status", "attempts", "subject", "body"
  `;
}

const QUEUE_ROW_SELECT = {
  id: true,
  broadcastId: true,
  recipientType: true,
  recipientId: true,
  email: true,
  notificationId: true,
  status: true,
  attempts: true,
  subject: true,
  body: true,
} as const;

/** Put claimed-but-unsent rows back so another drainer can take them. */
async function releaseRows(rows: QueueRow[]): Promise<void> {
  if (rows.length === 0) return;
  await prisma.broadcastRecipient.updateMany({
    where: { id: { in: rows.map((r) => r.id) } },
    data: { status: 'pending', claimedAt: null },
  });
}

/**
 * Recompute a broadcast's counters and lifecycle status from its rows.
 *   queued   — nothing sent yet, rows still pending
 *   sending  — some progress, rows still pending/sending
 *   completed — all rows sent
 *   partial  — all rows terminal, at least one failed
 */
export async function refreshBroadcastCounters(broadcastId: string): Promise<{
  sent: number;
  failed: number;
  open: number;
  status: string;
}> {
  const groups = await prisma.broadcastRecipient.groupBy({
    by: ['status'],
    where: { broadcastId },
    _count: { _all: true },
  });
  const count = (status: string) => groups.find((g) => g.status === status)?._count._all ?? 0;
  const sent = count('sent');
  const failed = count('failed');
  const open = count('pending') + count('sending');

  let status: string;
  if (open > 0) status = sent + failed === 0 ? 'queued' : 'sending';
  else status = failed > 0 ? 'partial' : 'completed';

  await prisma.broadcast.update({
    where: { id: broadcastId },
    data: { emailSentCount: sent, emailFailedCount: failed, status },
  });
  return { sent, failed, open, status };
}

/** Stamp emailStatus on the dashboard notifications that belong to these rows. */
async function stampRows(rows: QueueRow[], status: 'sent' | 'failed'): Promise<void> {
  const ids = rows.map((r) => r.notificationId).filter(Boolean) as string[];
  await stampEmailStatus(ids, status);

  // The shared-inbox admin row stands for every admin notification of its broadcast.
  const adminRows = rows.filter((r) => r.recipientType === 'admin');
  for (const r of adminRows) {
    await prisma.notification.updateMany({
      where: { relatedEntityType: 'broadcast', relatedEntityId: r.broadcastId, recipientType: 'admin' },
      data: { emailStatus: status },
    });
  }
}

/** The batch's recipient type when uniform (BCC shares one body), else undefined. */
function batchAudience(rows: QueueRow[]): EmailAudience | undefined {
  const first = rows[0]?.recipientType;
  if (first !== 'participant' && first !== 'mentor') return undefined;
  return rows.every((r) => r.recipientType === first) ? first : undefined;
}

/**
 * Send one batch (all rows share a broadcast) and persist the per-recipient
 * outcome. Returns the counts for this batch.
 */
async function processBatch(
  rows: QueueRow[],
  broadcast: { id: string; title: string; body: string; emailSubject: string | null },
  config: SmtpConfig,
  send: SendFn,
  nowMs: number
): Promise<{ sent: number; failed: number; retried: number }> {
  // Rows with their own body (credentials) are delivered as individual
  // emails — each addressed to its recipient alone, never BCC (Mandrill: one
  // merge-var call per batch; SMTP: one message each). Shared rows share the
  // broadcast body and go out as one BCC.
  const individual = rows.every((r) => r.body != null);
  const subject = broadcast.emailSubject || broadcast.title;
  const result = await send({
    config,
    ...(individual
      ? { items: rows.map((r) => ({ to: r.email, subject: r.subject || subject, bodyText: r.body as string })), bcc: [] }
      : { bcc: rows.map((r) => r.email) }),
    subject,
    bodyText: broadcast.body,
    broadcastId: broadcast.id,
    audience: batchAudience(rows),
  });

  const accepted = new Set(result.accepted.map((e) => e.toLowerCase()));
  const rejection = new Map(result.rejected.map((r) => [r.email.toLowerCase(), r]));

  const sentRows: QueueRow[] = [];
  const failedRows: Array<{ row: QueueRow; error: string }> = [];
  const retryRows: Array<{ row: QueueRow; error: string }> = [];

  for (const row of rows) {
    const key = row.email.toLowerCase();
    if (accepted.has(key)) {
      sentRows.push(row);
      continue;
    }
    const rej = rejection.get(key);
    const error = rej?.reason ?? result.error ?? 'not accepted by transport';
    const attemptsSoFar = row.attempts + 1;
    if (rej?.permanent || attemptsSoFar >= QUEUE_MAX_ATTEMPTS) failedRows.push({ row, error });
    else retryRows.push({ row, error });
  }

  const sentAt = new Date(nowMs);
  if (sentRows.length > 0) {
    await prisma.broadcastRecipient.updateMany({
      where: { id: { in: sentRows.map((r) => r.id) } },
      data: {
        status: 'sent',
        attempts: { increment: 1 },
        sentAt,
        providerMessageId: result.messageId ?? null,
        error: null,
        claimedAt: null,
        // Delivered: drop the rendered content so credentials never linger.
        subject: null,
        body: null,
      },
    });
    await stampRows(sentRows, 'sent');
  }
  for (const { row, error } of failedRows) {
    await prisma.broadcastRecipient.update({
      where: { id: row.id },
      data: { status: 'failed', attempts: { increment: 1 }, error, claimedAt: null },
    });
  }
  if (failedRows.length > 0) await stampRows(failedRows.map((f) => f.row), 'failed');
  for (const { row, error } of retryRows) {
    const attempts = row.attempts + 1;
    await prisma.broadcastRecipient.update({
      where: { id: row.id },
      data: {
        status: 'pending',
        attempts,
        error,
        claimedAt: null,
        nextAttemptAt: new Date(nowMs + RETRY_BACKOFF_MS * attempts),
      },
    });
  }

  return { sent: sentRows.length, failed: failedRows.length, retried: retryRows.length };
}

/**
 * Work the queue until it is empty or the time budget is spent.
 * Safe to run concurrently (cron + inline) — see claimSlice().
 */
export async function drainEmailQueue(options: DrainOptions): Promise<DrainResult> {
  const now = options.now ?? Date.now;
  const send = options.send ?? sendRawEmail;
  const sliceSize = options.sliceSize ?? DEFAULT_SLICE_SIZE;
  const startedAt = now();
  const overBudget = () => now() - startedAt > options.budgetMs;

  const totals: DrainResult = {
    claimed: 0, sent: 0, failed: 0, retried: 0, released: 0, remaining: 0,
    broadcastIds: [], stoppedBy: 'empty',
  };
  const touched = new Set<string>();
  const broadcastCache = new Map<string, { id: string; title: string; body: string; emailSubject: string | null }>();

  // Transport config is read once per run; the master switch is honoured here
  // so an admin can pause a running broadcast by disabling email.
  const settings = await getEmailSettings();
  const config = settings && settings.enabled ? toSmtpConfig(settings) : null;

  while (!overBudget()) {
    const rows = await claimSlice(sliceSize, now());
    if (rows.length === 0) break;
    totals.claimed += rows.length;

    if (!config) {
      // Email disabled/incomplete: park the rows (not failed — the admin may
      // just be reconfiguring) and stop. The cron will retry next minute.
      await releaseRows(rows);
      totals.released += rows.length;
      totals.stoppedBy = 'email-disabled';
      break;
    }

    // Group by broadcast (subject/body differ), then chunk per transport cap.
    const byBroadcast = new Map<string, QueueRow[]>();
    for (const r of rows) {
      const list = byBroadcast.get(r.broadcastId) ?? [];
      list.push(r);
      byBroadcast.set(r.broadcastId, list);
    }

    let budgetHit = false;
    const unsent: QueueRow[] = [];
    for (const [broadcastId, list] of Array.from(byBroadcast.entries())) {
      let broadcast = broadcastCache.get(broadcastId);
      if (!broadcast) {
        const b = await prisma.broadcast.findUnique({
          where: { id: broadcastId },
          select: { id: true, title: true, body: true, emailSubject: true },
        });
        if (!b) {
          // Broadcast deleted underneath the queue — rows cascade-delete, nothing to send.
          continue;
        }
        broadcast = b;
        broadcastCache.set(broadcastId, b);
      }
      touched.add(broadcastId);

      // Rows carrying their own content are batched by what the transport
      // can carry per call (Mandrill 100 via merge vars, SMTP 5 sequential);
      // the rest share the broadcast body and go out in BCC chunks.
      const individualRows = list.filter((r) => r.body != null);
      const sharedRows = list.filter((r) => r.body == null);
      const batches: QueueRow[][] = [];
      const perCall = getIndividualBatchSize();
      for (let i = 0; i < individualRows.length; i += perCall) batches.push(individualRows.slice(i, i + perCall));
      const emailChunks = chunkRecipients(sharedRows.map((r) => r.email));
      let cursor = 0;
      for (const chunk of emailChunks) {
        batches.push(sharedRows.slice(cursor, cursor + chunk.length));
        cursor += chunk.length;
      }
      for (const batchRows of batches) {
        if (budgetHit || overBudget()) {
          budgetHit = true;
          unsent.push(...batchRows);
          continue;
        }
        const r = await processBatch(batchRows, broadcast, config, send, now());
        totals.sent += r.sent;
        totals.failed += r.failed;
        totals.retried += r.retried;
      }
      await refreshBroadcastCounters(broadcastId);
    }

    if (budgetHit) {
      await releaseRows(unsent);
      totals.released += unsent.length;
      const affected = Array.from(new Set(unsent.map((r) => r.broadcastId)));
      for (const id of affected) await refreshBroadcastCounters(id);
      totals.stoppedBy = 'budget';
      break;
    }
  }

  if (totals.stoppedBy === 'empty' && overBudget()) totals.stoppedBy = 'budget';
  totals.broadcastIds = Array.from(touched);
  totals.remaining = await prisma.broadcastRecipient.count({
    where: { status: { in: ['pending', 'sending'] } },
  });
  return totals;
}

/** "Retry failed" button: flip a broadcast's failed rows back to pending. */
export async function requeueFailed(broadcastId: string): Promise<number> {
  const result = await prisma.broadcastRecipient.updateMany({
    where: { broadcastId, status: 'failed' },
    data: { status: 'pending', attempts: 0, nextAttemptAt: null, error: null, claimedAt: null },
  });
  if (result.count > 0) await refreshBroadcastCounters(broadcastId);
  return result.count;
}
