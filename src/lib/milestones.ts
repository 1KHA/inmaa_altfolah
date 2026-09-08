/**
 * Milestone submission rules — deadline and resubmission.
 *
 * One place for "may this participant submit right now?", so the submission
 * API, the public milestone list and the dashboards cannot disagree.
 * See mdfiles/phases-plan.md §2b/§2c.
 *
 * Before this existed the due date was decoration: `submit-milestone` never
 * looked at it and the dashboard's submit button was gated only on whether a
 * file had been chosen, so uploads days late were recorded as on-time.
 */

/** Reviewer outcomes. `needs_resubmission` re-opens the upload for one more go. */
export type ReviewStatus = 'pending' | 'accepted' | 'rejected' | 'needs_resubmission';
export const REVIEW_STATUSES: ReviewStatus[] = ['pending', 'accepted', 'rejected', 'needs_resubmission'];

/** Deadlines are meant as "end of that day" for users in Saudi Arabia. */
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * End of the deadline day in Asia/Riyadh, as an absolute instant.
 *
 * `dueDate` is stored at midnight UTC, so comparing against it directly would
 * expire every deadline three hours early for local users and lose the whole
 * final day. This is the same timezone trap that broke the email queue's claim
 * query earlier in this project.
 */
export function endOfDayRiyadh(due: Date): Date {
  const local = new Date(due.getTime() + RIYADH_OFFSET_MS);
  local.setUTCHours(23, 59, 59, 999);
  return new Date(local.getTime() - RIYADH_OFFSET_MS);
}

export interface DeadlineInput {
  dueDate: Date;
  allowLateSubmission?: boolean | null;
  /** Per-submission extension granted with a resubmission request. */
  resubmissionDeadline?: Date | null;
}

/** The deadline that actually applies: a resubmission extension wins. */
export function effectiveDeadline(input: DeadlineInput): Date {
  return endOfDayRiyadh(input.resubmissionDeadline ?? input.dueDate);
}

export interface SubmitEligibility {
  canSubmit: boolean;
  isLate: boolean;
  /** true when this would replace an existing submission. */
  isResubmission: boolean;
  effectiveDeadline: Date;
  reason?: string;
}

/**
 * Decide whether a submission is allowed right now.
 *
 * Rules, in order:
 *  1. An existing submission blocks a new one UNLESS the reviewer asked for a
 *     resubmission. `reviewStatus = null` (legacy rows) counts as pending, i.e.
 *     still blocked — it must never be read as "resubmission allowed".
 *  2. Past the effective deadline, submission is refused unless the milestone
 *     sets `allowLateSubmission`, in which case it is accepted and flagged.
 */
export function evaluateSubmission(params: {
  now: Date;
  milestone: DeadlineInput;
  existing?: { reviewStatus: string | null; resubmissionDeadline?: Date | null } | null;
}): SubmitEligibility {
  const { now, milestone, existing } = params;
  const deadline = effectiveDeadline({
    ...milestone,
    resubmissionDeadline: existing?.resubmissionDeadline ?? milestone.resubmissionDeadline ?? null,
  });
  const past = now > deadline;
  const isResubmission = Boolean(existing);

  if (existing && existing.reviewStatus !== 'needs_resubmission') {
    return {
      canSubmit: false,
      isLate: false,
      isResubmission,
      effectiveDeadline: deadline,
      reason: 'لقد قمت بتسليم هذا المشروع بالفعل ولا يمكنك التسليم مرة أخرى',
    };
  }

  if (past && !milestone.allowLateSubmission) {
    return {
      canSubmit: false,
      isLate: true,
      isResubmission,
      effectiveDeadline: deadline,
      reason: 'انتهى الموعد النهائي لهذا التسليم',
    };
  }

  return { canSubmit: true, isLate: past, isResubmission, effectiveDeadline: deadline };
}
