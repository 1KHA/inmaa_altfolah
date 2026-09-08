import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/notification-auth';

export const dynamic = 'force-dynamic';

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

    return NextResponse.json({
      success: true,
      disabled,
      participantsUpdated,
      teamsUpdated,
      mentorsUpdated,
    });
  } catch (error) {
    console.error('Error updating account disabled state:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
