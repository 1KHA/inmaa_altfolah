/**
 * Account disabling — the single definition of "is this account disabled?".
 *
 * An admin can disable a participant directly, or disable a whole team. A
 * participant is **effectively disabled** when either is true:
 *
 *     effectiveDisabled = participant.isDisabled
 *                      || participant.team.isDisabled
 *                      || (the governing PHASE).isDisabled
 *
 * Deriving it (rather than cascading a write onto every member) means
 * re-enabling a team instantly restores exactly the members who were not
 * individually disabled, with no bookkeeping.
 *
 * A disabled account:
 *   - cannot log in (src/app/api/login/route.ts)
 *
 * Mentors have the same flag (`Mentor.isDisabled`). A disabled mentor also
 * disappears from the participant-facing mentor list and cannot be booked.
 *   - cannot perform any participant action — every participant-facing API
 *     goes through requireActiveParticipant() below
 *   - receives NO transactional email or dashboard notification
 *     (src/lib/notify.ts filters them out of every audience)
 *
 * The one deliberate exception: an admin CAN still target disabled accounts
 * from the broadcast composer using the "الحسابات المعطلة" audience, so
 * rejection/"you did not qualify" notices can be sent. See
 * mdfiles/disable-accounts.md.
 */
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

/** Prisma `where` fragment: participants who are NOT disabled (own flag or team's). */
/**
 * "This row's phase does not block it" — either it has no phase, or the phase
 * it has is enabled. Reused everywhere so the null case is never forgotten.
 */
const PHASE_OK = { OR: [{ phaseId: null }, { phase: { is: { isDisabled: false } } }] };

export const ACTIVE_PARTICIPANT_WHERE: Prisma.ParticipantWhereInput = {
  isDisabled: false,
  OR: [
    // individual: their own phase governs
    { teamId: null, ...PHASE_OK },
    // team member: the TEAM's phase governs, not their own row's
    { team: { is: { isDisabled: false, ...PHASE_OK } } },
  ],
};

/**
 * Participants who may receive BULK email (milestone/event announcements and
 * the "all participants" broadcast).
 *
 * Mirrors the rule `/api/login` uses to decide who may enter the platform,
 * which is the only correct definition here:
 *   - a TEAM MEMBER is approved when their **team** is approved. Note that
 *     `approve-team` never touches `Participant.status`, so members keep
 *     `status: 'pending'` for ever — filtering on their own status would
 *     silence every legitimate team member.
 *   - an INDIVIDUAL is approved when their own `status` is 'approved'.
 * Disabled accounts (own flag or their team's) are excluded either way.
 *
 * This deliberately does NOT apply to targeted notifications: an approval or a
 * rejection notice is dispatched *after* the status changes, so filtering those
 * would mean nobody is ever told they were accepted or rejected.
 */
export const ELIGIBLE_PARTICIPANT_WHERE: Prisma.ParticipantWhereInput = {
  isDisabled: false,
  OR: [
    { teamId: null, status: 'approved', ...PHASE_OK },
    { team: { is: { isDisabled: false, status: 'approved', ...PHASE_OK } } },
  ],
};

/** Mentors who may receive bulk email: activated by an admin and not disabled. */
export const ELIGIBLE_MENTOR_WHERE: Prisma.MentorWhereInput = {
  isDisabled: false,
  status: 'active',
};

/** Prisma `where` fragment: participants who ARE disabled (own flag or team's). */
export const DISABLED_PARTICIPANT_WHERE: Prisma.ParticipantWhereInput = {
  OR: [
    { isDisabled: true },
    { team: { is: { isDisabled: true } } },
    { teamId: null, phase: { is: { isDisabled: true } } },
    { team: { is: { phase: { is: { isDisabled: true } } } } },
  ],
};

/** Shape needed to decide; `team` may be absent for individual participants. */
export interface DisableCheckable {
  isDisabled?: boolean | null;
  phase?: { isDisabled?: boolean | null } | null;
  team?: {
    isDisabled?: boolean | null;
    phase?: { isDisabled?: boolean | null } | null;
  } | null;
}

/**
 * True when the participant is disabled directly, through their team, or
 * through the phase that governs them.
 *
 * For a TEAM MEMBER the governing phase is the team's — their own `phaseId` is
 * ignored, mirroring how approval works.
 */
export function isEffectivelyDisabled(participant: DisableCheckable | null | undefined): boolean {
  if (!participant) return false;
  if (participant.isDisabled) return true;
  if (participant.team) {
    return Boolean(participant.team.isDisabled) || Boolean(participant.team.phase?.isDisabled);
  }
  return Boolean(participant.phase?.isDisabled);
}

/** Arabic message shown to a disabled account that tries to log in or act. */
export const DISABLED_ACCOUNT_MESSAGE =
  'تم تعطيل هذا الحساب من قبل إدارة الهاكاثون. للاستفسار يرجى التواصل مع المنظمين.';

/**
 * Look up a participant's effective disabled state by id.
 * Returns `false` when the participant does not exist — callers handle
 * "not found" separately; this function answers only "is it disabled".
 */
export async function isParticipantDisabled(participantId: string): Promise<boolean> {
  if (!participantId) return false;
  try {
    const row = await prisma.participant.findUnique({
      where: { id: participantId },
      select: {
        isDisabled: true,
        phase: { select: { isDisabled: true } },
        team: { select: { isDisabled: true, phase: { select: { isDisabled: true } } } },
      },
    });
    return isEffectivelyDisabled(row);
  } catch {
    // Fail OPEN on an infrastructure error: a database blip must not lock
    // every participant out. Login still verifies credentials normally.
    return false;
  }
}

/** Partition ids into disabled / active — used by the bulk admin actions. */
export async function splitDisabledParticipants(ids: string[]): Promise<{
  disabled: string[];
  active: string[];
}> {
  if (ids.length === 0) return { disabled: [], active: [] };
  const rows = await prisma.participant.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      isDisabled: true,
      phase: { select: { isDisabled: true } },
      team: { select: { isDisabled: true, phase: { select: { isDisabled: true } } } },
    },
  });
  const disabled: string[] = [];
  const active: string[] = [];
  for (const r of rows) (isEffectivelyDisabled(r) ? disabled : active).push(r.id);
  return { disabled, active };
}

/**
 * Route guard: refuse the request when the participant is disabled.
 *
 * Returns a ready-to-return 403 `NextResponse`, or `null` when the account is
 * active and the handler should continue:
 *
 *     const blocked = await requireActiveParticipant(decoded.participantId);
 *     if (blocked) return blocked;
 *
 * Every participant-facing route decodes the JWT itself (there is no shared
 * auth middleware for /api/participant/*, and Next 14 middleware runs on Edge
 * where Prisma is unavailable), so this is called per route right after the
 * token is decoded.
 *
 * 403 rather than 401: the credentials are valid, the account is not.
 */
export async function requireActiveParticipant(
  participantId: string | undefined | null
): Promise<NextResponse | null> {
  if (!participantId) return null; // the route's own auth check handles this
  if (!(await isParticipantDisabled(participantId))) return null;
  return NextResponse.json({ error: DISABLED_ACCOUNT_MESSAGE, disabled: true }, { status: 403 });
}

// ---------------------------------------------------------------------------
// Mentors — same feature, simpler because a mentor has no parent record.
// ---------------------------------------------------------------------------

/** Prisma `where` fragment: mentors who are NOT disabled. */
export const ACTIVE_MENTOR_WHERE: Prisma.MentorWhereInput = { isDisabled: false };

/** Prisma `where` fragment: mentors who ARE disabled. */
export const DISABLED_MENTOR_WHERE: Prisma.MentorWhereInput = { isDisabled: true };

/** Look up a mentor's disabled state by id. Fails open like the participant version. */
export async function isMentorDisabled(mentorId: string): Promise<boolean> {
  if (!mentorId) return false;
  try {
    const row = await prisma.mentor.findUnique({
      where: { id: mentorId },
      select: { isDisabled: true },
    });
    return Boolean(row?.isDisabled);
  } catch {
    return false;
  }
}

/**
 * Route guard for mentor-facing endpoints — mirrors requireActiveParticipant().
 * Returns a ready 403 response, or null to continue.
 */
export async function requireActiveMentor(
  mentorId: string | undefined | null
): Promise<NextResponse | null> {
  if (!mentorId) return null;
  if (!(await isMentorDisabled(mentorId))) return null;
  return NextResponse.json({ error: DISABLED_ACCOUNT_MESSAGE, disabled: true }, { status: 403 });
}

/**
 * Participants governed by a given phase — a team member through their TEAM's
 * phase, an individual through their own.
 *
 * Combined with ELIGIBLE_PARTICIPANT_WHERE by the caller, so a disabled or
 * unapproved account is still excluded. `failedOnly` narrows to those marked
 * failed in that phase (they are NOT disabled, so they still receive email —
 * that is the point of being able to write to them).
 */
export function phaseParticipantWhere(phaseId: string, failedOnly = false): Prisma.ParticipantWhereInput {
  const status = failedOnly ? { phaseStatus: 'failed' } : {};
  return {
    OR: [
      { teamId: null, phaseId, ...status },
      { team: { is: { phaseId, ...status } } },
    ],
  };
}
