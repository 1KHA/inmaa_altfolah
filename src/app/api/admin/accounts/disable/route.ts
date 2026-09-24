import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/notification-auth';
import { issueReactivationCredentials } from '@/lib/reactivation';
import { drainEmailQueue } from '@/lib/email-queue';
import { waitUntil } from '@vercel/functions';

export const dynamic = 'force-dynamic';
// Re-enabling a large team hashes one password per member; give it room.
export const maxDuration = 300;

/**
 * POST — disable or re-enable accounts, one or many at a time.
 *
 * Body: { participantIds?: string[], teamIds?: string[], mentorIds?: string[], disabled: boolean }
 *
 * Disabling a TEAM disables every member with it implicitly (the effective
 * check in src/lib/account-status.ts ORs the team flag), so member rows are
 * NOT rewritten here — re-enabling the team then restores exactly the members
 * who were not individually disabled.
 *
 * Idempotent: disabling an already-disabled account is a no-op that still
 * returns success. See mdfiles/disable-accounts.md.
 *
 * Re-enabling (disabled=false) also issues a NEW password to every affected
 * approved participant and queues them a credentials email — pass
 * `sendCredentials: false` to skip that. See src/lib/reactivation.ts.
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
    const participantIds: string[] = Array.isArray(body.participantIds) ? body.participantIds : [];
    const teamIds: string[] = Array.isArray(body.teamIds) ? body.teamIds : [];
    const mentorIds: string[] = Array.isArray(body.mentorIds) ? body.mentorIds : [];
    const disabled = body.disabled;

    if (typeof disabled !== 'boolean') {
      return NextResponse.json({ error: 'الحقل disabled مطلوب (true/false)' }, { status: 400 });
    }
    if (participantIds.length === 0 && teamIds.length === 0 && mentorIds.length === 0) {
      return NextResponse.json({ error: 'يرجى اختيار حساب واحد على الأقل' }, { status: 400 });
    }

    const data = disabled
      ? { isDisabled: true, disabledAt: new Date() }
      : { isDisabled: false, disabledAt: null };

    let participantsUpdated = 0;
    let teamsUpdated = 0;
    let mentorsUpdated = 0;

    // Credentials are re-issued only for accounts that were actually disabled
    // before this call — re-clicking "enable" on an enabled account must not
    // reset anybody's password.
    const wasDisabled = !disabled
      ? {
          participantIds: (await prisma.participant.findMany({ where: { id: { in: participantIds }, isDisabled: true }, select: { id: true } })).map((r) => r.id),
          teamIds: (await prisma.team.findMany({ where: { id: { in: teamIds }, isDisabled: true }, select: { id: true } })).map((r) => r.id),
        }
      : { participantIds: [] as string[], teamIds: [] as string[] };

    await prisma.$transaction(async (tx) => {
      if (participantIds.length > 0) {
        participantsUpdated = (
          await tx.participant.updateMany({ where: { id: { in: participantIds } }, data })
        ).count;
      }
      if (teamIds.length > 0) {
        teamsUpdated = (await tx.team.updateMany({ where: { id: { in: teamIds } }, data })).count;
      }
      if (mentorIds.length > 0) {
        mentorsUpdated = (await tx.mentor.updateMany({ where: { id: { in: mentorIds } }, data })).count;
      }
    });

    console.log(
      `[accounts] admin ${adminId} ${disabled ? 'disabled' : 'enabled'} ` +
        `${participantsUpdated} participant(s), ${teamsUpdated} team(s), ${mentorsUpdated} mentor(s)`
    );

    let credentialsIssued = 0;
    let emailJobId: string | null = null;
    if (!disabled && body.sendCredentials !== false && (wasDisabled.participantIds.length > 0 || wasDisabled.teamIds.length > 0)) {
      try {
        const issued = await issueReactivationCredentials(adminId, wasDisabled);
        credentialsIssued = issued.credentialsIssued;
        emailJobId = issued.emailJobId;
        if (credentialsIssued > 0) {
          try {
            waitUntil(drainEmailQueue({ budgetMs: 240_000 }).catch((err) => console.error('[accounts] inline drain failed:', err)));
          } catch {
            // not on Vercel — the admin drain endpoint / cron deliver the queue
          }
        }
      } catch (error) {
        // Accounts are already re-enabled; never fail the request over emails.
        console.error('[accounts] reactivation credentials failed:', error);
      }
    }

    return NextResponse.json({
      success: true,
      disabled,
      participantsUpdated,
      teamsUpdated,
      mentorsUpdated,
      credentialsIssued,
      emailJobId,
    });
  } catch (error) {
    console.error('Error updating account disabled state:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
