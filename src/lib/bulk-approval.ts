/**
 * Bulk acceptance of pending teams / individual participants.
 *
 * Accepting hundreds of teams means hundreds of bcrypt hashes and thousands of
 * per-person credential emails — far beyond one request. So a bulk job is:
 *
 *   1. a Broadcast row (audience.type = 'bulk-approval') that carries the job's
 *      progress and doubles as the parent of its queued emails, so the existing
 *      queue drainers, counters, history table and "retry failed" all apply;
 *   2. approval in short, budgeted chunks (runBulkJobChunk) that the admin UI
 *      calls in a loop. Each team/participant is approved exactly the way the
 *      single-approval routes do it (same status change, same credentials,
 *      same template), atomically, and only while still `pending` — so an
 *      interrupted job can simply be continued or re-run without touching
 *      anything twice;
 *   3. emails are NOT sent inline: each recipient's rendered credentials email
 *      is written to the queue (BroadcastRecipient.subject/body) and delivered
 *      one-by-one by drainEmailQueue() — inline after the last chunk, by the
 *      admin's "drain" endpoint while the progress dialog is open, and by cron.
 *
 * See mdfiles/bulk-approval.md.
 */
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';
import { createNotificationRows, renderRecipientEmail, type TemplateVariables } from './notify';
import { enqueueBroadcastRecipients, type QueueRecipientInput } from './email-queue';
import { generatePassword, credentialVariables, participantDisplayName } from './credentials';

export type BulkTarget = 'teams' | 'participants';

/** Progress persisted in Broadcast.audience (JSON). */
export interface BulkJobState {
  type: 'bulk-approval';
  target: BulkTarget;
  /** Explicit selection (null = every pending row at the time of each chunk). */
  ids: string[] | null;
  /** Next index into `ids` (selection mode). */
  cursor: number;
  requested: number;
  approved: number;
  /** Not pending any more when reached (already handled, disabled, missing). */
  skipped: number;
  failed: number;
  /** Ids that threw — excluded from later chunks so a job can never loop. */
  failedIds: string[];
  done: boolean;
}

export interface BulkJobProgress extends Omit<BulkJobState, 'ids' | 'failedIds' | 'cursor'> {
  jobId: string;
  /** Email queue counters from the Broadcast row + live row states. */
  emails: { total: number; sent: number; failed: number; status: string; pending: number; sending: number };
}

const JOB_TITLES: Record<BulkTarget, string> = {
  teams: 'قبول جماعي — الفرق',
  participants: 'قبول جماعي — المشاركون الأفراد',
};

/** Where clause for rows a bulk job may accept. */
function pendingWhere(target: BulkTarget, ids: string[] | null, exclude: string[]) {
  const base = ids ? { id: { in: ids } } : {};
  const notIn = exclude.length > 0 ? { id: { ...(ids ? { in: ids } : {}), notIn: exclude } } : base;
  return target === 'teams'
    ? { ...notIn, status: 'pending', isDisabled: false }
    : { ...notIn, status: 'pending', teamId: null, isDisabled: false };
}

/** How many rows a job would accept right now (for the confirm dialog). */
export async function countPending(target: BulkTarget, ids: string[] | null): Promise<number> {
  const where = pendingWhere(target, ids, []);
  return target === 'teams'
    ? prisma.team.count({ where: where as any })
    : prisma.participant.count({ where: where as any });
}

export async function createBulkJob(
  adminId: string,
  target: BulkTarget,
  ids: string[] | null
): Promise<{ jobId: string; requested: number }> {
  const requested = await countPending(target, ids);
  const state: BulkJobState = {
    type: 'bulk-approval',
    target,
    ids,
    cursor: 0,
    requested,
    approved: 0,
    skipped: 0,
    failed: 0,
    failedIds: [],
    done: requested === 0,
  };
  const job = await prisma.broadcast.create({
    data: {
      title: JOB_TITLES[target],
      body: 'بريد بيانات الدخول — محتوى فردي لكل مستلم (يُرسل عبر قائمة الانتظار)',
      emailSubject: null,
      channels: JSON.stringify(['dashboard', 'email']),
      audience: JSON.stringify(state),
      createdBy: adminId,
      status: requested === 0 ? 'completed' : 'queued',
    },
    select: { id: true },
  });
  return { jobId: job.id, requested };
}

async function loadJob(jobId: string) {
  const job = await prisma.broadcast.findUnique({
    where: { id: jobId },
    select: { id: true, audience: true, totalRecipients: true, emailSentCount: true, emailFailedCount: true, status: true },
  });
  if (!job) return null;
  let state: BulkJobState;
  try {
    state = JSON.parse(job.audience);
  } catch {
    return null;
  }
  if (state.type !== 'bulk-approval') return null;
  return { job, state };
}

async function toProgress(jobId: string, state: BulkJobState, job: { totalRecipients: number; emailSentCount: number; emailFailedCount: number; status: string }): Promise<BulkJobProgress> {
  const { ids: _ids, failedIds: _f, cursor: _c, ...rest } = state;
  // Live row states so the UI can tell "being sent right now" from "waiting".
  const groups = await prisma.broadcastRecipient.groupBy({ by: ['status'], where: { broadcastId: jobId }, _count: { _all: true } });
  const count = (s: string) => groups.find((g) => g.status === s)?._count._all ?? 0;
  return {
    jobId,
    ...rest,
    emails: {
      total: job.totalRecipients,
      sent: count('sent') || job.emailSentCount,
      failed: count('failed') || job.emailFailedCount,
      status: job.status,
      pending: count('pending'),
      sending: count('sending'),
    },
  };
}

export async function getBulkJob(jobId: string): Promise<BulkJobProgress | null> {
  const loaded = await loadJob(jobId);
  if (!loaded) return null;
  return toProgress(jobId, loaded.state, loaded.job);
}

async function saveState(jobId: string, state: BulkJobState): Promise<void> {
  await prisma.broadcast.update({ where: { id: jobId }, data: { audience: JSON.stringify(state) } });
}

/** Queue every emailable recipient's own rendered email under the job. */
async function enqueueCredentialEmails(
  jobId: string,
  planned: Awaited<ReturnType<typeof createNotificationRows>>
): Promise<number> {
  if (!planned) return 0;
  const rows: QueueRecipientInput[] = [];
  for (const r of planned.recipients) {
    if (!r.email) continue;
    const rendered = renderRecipientEmail(planned.template, r);
    if (!rendered) continue; // template email switched off by the admin
    rows.push({
      recipientType: r.recipientType,
      recipientId: r.recipientId,
      email: r.email,
      notificationId: r.notificationId,
      subject: rendered.subject,
      body: rendered.body,
    });
  }
  return enqueueBroadcastRecipients(jobId, rows);
}

type Outcome = 'approved' | 'skipped';

/**
 * Approve one team exactly like POST /api/admin/approve-team: status →
 * approved, a fresh password for EVERY member (hashed), one acceptance
 * notification + queued email per member with their own credentials.
 */
export async function approveTeamQueued(teamId: string, jobId: string): Promise<Outcome> {
  const team = await prisma.team.findUnique({ where: { id: teamId }, include: { participants: true } });
  if (!team || team.status !== 'pending' || team.isDisabled) return 'skipped';

  // Hash outside the transaction (bcrypt is the slow part), write inside it.
  const perRecipient: Record<string, TemplateVariables> = {};
  const hashes: Array<{ id: string; passwordHash: string }> = [];
  for (const p of team.participants) {
    const password = generatePassword();
    hashes.push({ id: p.id, passwordHash: await bcrypt.hash(password, 10) });
    perRecipient[p.id] = credentialVariables({ email: p.email, password, participantName: participantDisplayName(p) });
  }

  const approved = await prisma.$transaction(async (tx) => {
    // Guard on `pending` so two overlapping runs can never approve twice.
    const res = await tx.team.updateMany({ where: { id: teamId, status: 'pending' }, data: { status: 'approved' } });
    if (res.count === 0) return false;
    for (const h of hashes) {
      await tx.participant.update({ where: { id: h.id }, data: { passwordHash: h.passwordHash } });
    }
    return true;
  });
  if (!approved) return 'skipped';

  const planned = await createNotificationRows({
    templateKey: 'teamApproval',
    variables: { teamName: team.teamName || 'فريقك' },
    perRecipient,
    audience: { kind: 'team', teamId },
    relatedEntityType: 'team',
    relatedEntityId: teamId,
  });
  await enqueueCredentialEmails(jobId, planned);
  return 'approved';
}

/**
 * Approve one individual participant exactly like POST /api/admin/approve-participant:
 * status → approved, a password only if they have none, notification + queued email.
 */
export async function approveParticipantQueued(participantId: string, jobId: string): Promise<Outcome> {
  const participant = await prisma.participant.findUnique({ where: { id: participantId } });
  if (!participant || participant.status !== 'pending' || participant.teamId || participant.isDisabled) return 'skipped';

  let generatedPassword: string | null = null;
  let passwordHash = participant.passwordHash;
  if (!passwordHash) {
    generatedPassword = generatePassword();
    passwordHash = await bcrypt.hash(generatedPassword, 10);
  }

  const res = await prisma.participant.updateMany({
    where: { id: participantId, status: 'pending', teamId: null },
    data: { status: 'approved', passwordHash },
  });
  if (res.count === 0) return 'skipped';

  const planned = await createNotificationRows({
    templateKey: 'participantApproval',
    perRecipient: {
      [participantId]: credentialVariables({
        email: participant.email,
        password: generatedPassword, // null => "unchanged" text, as in the single route
        participantName: participantDisplayName(participant),
      }),
    },
    audience: { kind: 'participant', id: participantId },
    relatedEntityType: 'participant',
    relatedEntityId: participantId,
  });
  await enqueueCredentialEmails(jobId, planned);
  return 'approved';
}

/** Next ids to work on for this job (bounded, never re-visits failures). */
async function nextCandidates(state: BulkJobState, take: number): Promise<string[]> {
  if (state.ids) {
    const slice = state.ids.slice(state.cursor, state.cursor + take);
    return slice;
  }
  const where = pendingWhere(state.target, null, state.failedIds);
  const rows =
    state.target === 'teams'
      ? await prisma.team.findMany({ where: where as any, select: { id: true }, orderBy: { createdAt: 'asc' }, take })
      : await prisma.participant.findMany({ where: where as any, select: { id: true }, orderBy: { createdAt: 'asc' }, take });
  return rows.map((r) => r.id);
}

/**
 * Work the job until the time budget is spent or nothing is left. Safe to
 * call repeatedly; returns the up-to-date progress.
 */
export async function runBulkJobChunk(jobId: string, budgetMs: number): Promise<BulkJobProgress | null> {
  const loaded = await loadJob(jobId);
  if (!loaded) return null;
  const { state } = loaded;
  if (state.done) return getBulkJob(jobId);

  const startedAt = Date.now();
  const overBudget = () => Date.now() - startedAt > budgetMs;
  const approve = state.target === 'teams' ? approveTeamQueued : approveParticipantQueued;

  while (!overBudget()) {
    const candidates = await nextCandidates(state, 10);
    if (candidates.length === 0) {
      state.done = true;
      break;
    }
    for (const id of candidates) {
      if (state.ids) state.cursor++;
      try {
        const outcome = await approve(id, jobId);
        if (outcome === 'approved') state.approved++;
        else state.skipped++;
      } catch (error) {
        console.error(`[bulk-approval] ${state.target} ${id} failed:`, error);
        state.failed++;
        state.failedIds.push(id);
      }
      if (overBudget()) break;
    }
    // Persist after every batch so a killed function loses at most one batch
    // of counters (never an approval — those are committed per row).
    await saveState(jobId, state);
    if (state.ids && state.cursor >= state.ids.length) {
      state.done = true;
      break;
    }
  }
  await saveState(jobId, state);

  // A job with no queued emails (email disabled / template off) is finished as
  // soon as approvals are; otherwise the queue drainers own the status.
  if (state.done) {
    const job = await prisma.broadcast.findUnique({ where: { id: jobId }, select: { totalRecipients: true } });
    if (job && job.totalRecipients === 0) {
      await prisma.broadcast.update({ where: { id: jobId }, data: { status: 'completed' } });
    }
  }
  return getBulkJob(jobId);
}
