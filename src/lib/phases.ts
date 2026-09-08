/**
 * Phases — the ordered pipeline participants and teams move through.
 *
 * Every rule lives here so the API, the admin screens and the milestone review
 * agree. See mdfiles/phases-plan.md.
 *
 * Key decisions encoded below:
 *   - A TEAM MEMBER's phase is the TEAM's. Only an individual participant
 *     (no team) carries their own. This mirrors approval and avoids repeating
 *     the wart where `approve-team` leaves `Participant.status` meaningless.
 *   - MANUAL moves are an admin override: never blocked by `phaseStatus`, and
 *     they reset it to 'active' (you are giving the entity another run).
 *   - AUTO advance (milestone accepted) is forward-only and respects `failed`.
 */
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

export type PhaseStatus = 'active' | 'failed';
export type MoveMode = 'set' | 'next' | 'previous' | 'fail' | 'clear';

export interface PhaseRef {
  id: string;
  name: string;
  order: number;
}

/** Phases in pipeline order. */
export async function listPhasesOrdered(): Promise<PhaseRef[]> {
  return prisma.phase.findMany({
    orderBy: { order: 'asc' },
    select: { id: true, name: true, order: true },
  });
}

/** The phase immediately after/before `order`, or null at the boundary. */
export async function neighbourPhase(
  order: number,
  direction: 'next' | 'previous'
): Promise<PhaseRef | null> {
  return prisma.phase.findFirst({
    where: direction === 'next' ? { order: { gt: order } } : { order: { lt: order } },
    orderBy: { order: direction === 'next' ? 'asc' : 'desc' },
    select: { id: true, name: true, order: true },
  });
}

/**
 * Counts per phase for the admin screen, in 4 queries total rather than
 * per-phase — there are 300+ teams and participants on production.
 */
export async function phaseCounts(): Promise<
  Record<string, { teams: number; teamsFailed: number; participants: number; participantsFailed: number }>
> {
  const [teams, participants] = await Promise.all([
    prisma.team.groupBy({ by: ['phaseId', 'phaseStatus'], _count: { _all: true }, where: { phaseId: { not: null } } }),
    prisma.participant.groupBy({ by: ['phaseId', 'phaseStatus'], _count: { _all: true }, where: { phaseId: { not: null } } }),
  ]);
  const out: Record<string, { teams: number; teamsFailed: number; participants: number; participantsFailed: number }> = {};
  const bucket = (id: string) =>
    (out[id] ??= { teams: 0, teamsFailed: 0, participants: 0, participantsFailed: 0 });
  for (const r of teams) {
    const b = bucket(r.phaseId as string);
    b.teams += r._count._all;
    if (r.phaseStatus === 'failed') b.teamsFailed += r._count._all;
  }
  for (const r of participants) {
    const b = bucket(r.phaseId as string);
    b.participants += r._count._all;
    if (r.phaseStatus === 'failed') b.participantsFailed += r._count._all;
  }
  return out;
}

export interface MoveOutcome {
  moved: number;
  /** Already at the first/last phase — nothing to move to. */
  atBoundary: number;
  /** No phase assigned yet, so "next"/"previous" is meaningless. */
  unassigned: number;
  messages: string[];
}

const emptyOutcome = (): MoveOutcome => ({ moved: 0, atBoundary: 0, unassigned: 0, messages: [] });

/**
 * Apply a phase action to a set of teams and/or participants.
 *
 * `next`/`previous` move each row relative to ITS OWN phase, so a mixed
 * selection behaves sensibly. All writes are `updateMany` grouped by target
 * phase — never one query per row (that is what caused P2028 on the importer).
 */
export async function applyPhaseMove(params: {
  teamIds?: string[];
  participantIds?: string[];
  mode: MoveMode;
  phaseId?: string | null;
}): Promise<MoveOutcome> {
  const { teamIds = [], participantIds = [], mode, phaseId } = params;
  const outcome = emptyOutcome();
  if (teamIds.length === 0 && participantIds.length === 0) return outcome;

  // --- simple modes: one updateMany per entity type ---
  if (mode === 'fail' || mode === 'clear' || mode === 'set') {
    const data =
      mode === 'set'
        ? { phaseId: phaseId ?? null, phaseStatus: 'active', phaseUpdatedAt: new Date() }
        : { phaseStatus: mode === 'fail' ? 'failed' : 'active', phaseUpdatedAt: new Date() };

    const [t, p] = await prisma.$transaction([
      prisma.team.updateMany({ where: { id: { in: teamIds } }, data }),
      prisma.participant.updateMany({ where: { id: { in: participantIds } }, data }),
    ]);
    outcome.moved = t.count + p.count;
    return outcome;
  }

  // --- next / previous: resolve each row's current phase, then batch ---
  const phases = await listPhasesOrdered();
  const byId = new Map(phases.map((p) => [p.id, p]));

  const [teams, participants] = await Promise.all([
    teamIds.length ? prisma.team.findMany({ where: { id: { in: teamIds } }, select: { id: true, phaseId: true } }) : [],
    participantIds.length
      ? prisma.participant.findMany({ where: { id: { in: participantIds } }, select: { id: true, phaseId: true } })
      : [],
  ]);

  /** target phase id -> ids to move there */
  const teamTargets = new Map<string, string[]>();
  const participantTargets = new Map<string, string[]>();

  const plan = (rows: { id: string; phaseId: string | null }[], targets: Map<string, string[]>) => {
    for (const row of rows) {
      if (!row.phaseId) { outcome.unassigned++; continue; }
      const current = byId.get(row.phaseId);
      if (!current) { outcome.unassigned++; continue; }
      const idx = phases.findIndex((p) => p.id === current.id);
      const target = mode === 'next' ? phases[idx + 1] : phases[idx - 1];
      if (!target) { outcome.atBoundary++; continue; }
      (targets.get(target.id) ?? targets.set(target.id, []).get(target.id)!).push(row.id);
    }
  };
  plan(teams, teamTargets);
  plan(participants, participantTargets);

  const writes: Prisma.PrismaPromise<unknown>[] = [];
  const now = new Date();
  for (const [target, ids] of Array.from(teamTargets.entries())) {
    writes.push(prisma.team.updateMany({
      where: { id: { in: ids } },
      // A manual move resets `failed`: the admin is giving them another run.
      data: { phaseId: target, phaseStatus: 'active', phaseUpdatedAt: now },
    }));
    outcome.moved += ids.length;
  }
  for (const [target, ids] of Array.from(participantTargets.entries())) {
    writes.push(prisma.participant.updateMany({
      where: { id: { in: ids } },
      data: { phaseId: target, phaseStatus: 'active', phaseUpdatedAt: now },
    }));
    outcome.moved += ids.length;
  }
  if (writes.length) await prisma.$transaction(writes);

  if (outcome.atBoundary > 0) {
    outcome.messages.push(
      mode === 'next'
        ? `${outcome.atBoundary} في المرحلة الأخيرة بالفعل`
        : `${outcome.atBoundary} في المرحلة الأولى بالفعل`
    );
  }
  if (outcome.unassigned > 0) outcome.messages.push(`${outcome.unassigned} بدون مرحلة`);
  return outcome;
}

export interface AutoAdvanceResult {
  advanced: boolean;
  advancedTo?: string;
  reason?: string;
}

/**
 * Auto-advance after a milestone submission is ACCEPTED.
 *
 * Only fires when the milestone's phase equals the entity's CURRENT phase.
 * That single condition makes it idempotent — re-accepting a review does
 * nothing, because the entity has already moved on — and stops an early
 * milestone from skipping someone ahead.
 *
 * Never throws: a review must succeed even if the phase move cannot.
 */
export async function autoAdvanceForMilestone(params: {
  milestonePhaseId: string | null;
  teamId: string | null;
  participantId: string;
}): Promise<AutoAdvanceResult> {
  const { milestonePhaseId, teamId, participantId } = params;
  try {
    if (!milestonePhaseId) return { advanced: false, reason: 'المرحلة غير مرتبطة بهذا التسليم' };

    const target = teamId
      ? await prisma.team.findUnique({ where: { id: teamId }, select: { phaseId: true, phaseStatus: true } })
      : await prisma.participant.findUnique({ where: { id: participantId }, select: { phaseId: true, phaseStatus: true } });

    if (!target) return { advanced: false, reason: 'لم يتم العثور على الفريق أو المشارك' };
    if (target.phaseStatus === 'failed') return { advanced: false, reason: 'محدد كمتعثر — لا يمكن التقدم تلقائياً' };
    // An entity that was never ASSIGNED a phase is treated as being AT the
    // milestone's phase: accepting that phase's milestone means they completed
    // it, so they advance like everyone else. (Teams are created with
    // phaseId=null — without this, acceptance silently moved nobody.)
    // An entity assigned to a DIFFERENT phase still does not move; that is
    // what keeps re-accepting idempotent after the advance.
    if (target.phaseId !== null && target.phaseId !== milestonePhaseId) {
      return { advanced: false, reason: 'ليس في مرحلة هذا التسليم' };
    }

    const current = await prisma.phase.findUnique({ where: { id: milestonePhaseId }, select: { order: true } });
    if (!current) return { advanced: false, reason: 'المرحلة غير موجودة' };

    const next = await neighbourPhase(current.order, 'next');
    if (!next) return { advanced: false, reason: 'لا توجد مرحلة تالية' };

    const data = { phaseId: next.id, phaseStatus: 'active', phaseUpdatedAt: new Date() };
    if (teamId) await prisma.team.update({ where: { id: teamId }, data });
    else await prisma.participant.update({ where: { id: participantId }, data });

    return { advanced: true, advancedTo: next.name };
  } catch (error) {
    console.error('[phases] auto-advance failed:', error);
    return { advanced: false, reason: 'تعذر تحديث المرحلة' };
  }
}

/** Mark the submitter's team (or the individual) as failed in their phase. */
export async function markFailedForMilestone(params: {
  teamId: string | null;
  participantId: string;
}): Promise<void> {
  const { teamId, participantId } = params;
  try {
    const data = { phaseStatus: 'failed', phaseUpdatedAt: new Date() };
    if (teamId) await prisma.team.update({ where: { id: teamId }, data });
    else await prisma.participant.update({ where: { id: participantId }, data });
  } catch (error) {
    console.error('[phases] mark-failed failed:', error);
  }
}
