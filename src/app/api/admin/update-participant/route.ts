import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/notification-auth';
import { PARTICIPANT_PUBLIC_FIELDS } from '@/lib/participant-fields';
import { notifyEmailChanged } from '@/lib/reactivation';

/**
 * This route lives under /api/admin/ but in practice is called by the
 * PARTICIPANT team page — a team leader editing a member's details
 * (src/app/participant-dashboard/team/page.tsx). It has no admin-only
 * counterpart UI, so it cannot be gated with requireAdmin() without breaking
 * that feature.
 *
 * Authorized callers: an admin, OR the team leader of the participant being
 * edited. Anyone else — including an unauthenticated caller — is rejected.
 *
 * The field blocklist mirrors /api/participant/update-profile: sensitive
 * fields (status, teamId, isLeader, passwordHash, ...) can never be set
 * through this endpoint, closing a mass-assignment hole that previously let
 * the raw request body flow straight into the Prisma update.
 */
export async function POST(req: Request) {
  try {
    const claims = verifyToken(cookies().get('token')?.value);
    if (!claims) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }

    const body = await req.json();
    const { id, ...rawUpdate } = body;

    if (!id) {
      return NextResponse.json({ error: 'Participant ID is required' }, { status: 400 });
    }

    if (claims.role !== 'admin') {
      // must be the team leader of the participant being edited
      const callerId = claims.participantId || claims.id;
      const caller = callerId
        ? await prisma.participant.findUnique({
            where: { id: callerId },
            select: { isLeader: true, teamId: true },
          })
        : null;

      if (!caller || !caller.isLeader || !caller.teamId) {
        return NextResponse.json({ error: 'غير مصرح' }, { status: 403 });
      }

      const target = await prisma.participant.findUnique({
        where: { id },
        select: { teamId: true },
      });

      if (!target || target.teamId !== caller.teamId) {
        return NextResponse.json({ error: 'المشارك ليس في فريقك' }, { status: 403 });
      }
    }

    // Only profile fields may be written here. Everything sensitive (status,
    // teamId, isLeader, passwordHash, phase, disabled flags, badge…) and any
    // unknown key is dropped — same policy as /api/participant/update-profile,
    // but as an explicit whitelist so a stray key can never reach Prisma.
    const dataToUpdate: Record<string, unknown> = {};
    for (const key of EDITABLE_FIELDS) {
      if (key in rawUpdate) dataToUpdate[key] = rawUpdate[key];
    }
    // The admin edits the stored display name directly; team leaders keep the
    // historical behaviour (name comes from the split name fields).
    if (claims.role === 'admin' && 'fullName' in rawUpdate) dataToUpdate.fullName = rawUpdate.fullName;

    for (const key of Object.keys(dataToUpdate)) {
      const v = dataToUpdate[key];
      if (typeof v === 'string') dataToUpdate[key] = v.trim();
      if (BOOLEAN_FIELDS.has(key) && v !== null && v !== undefined && typeof v !== 'boolean') {
        dataToUpdate[key] = v === 'true' || v === 1 || v === '1';
      }
    }
    if (typeof dataToUpdate.email === 'string') {
      const email = dataToUpdate.email.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ error: 'صيغة البريد الإلكتروني غير صالحة' }, { status: 400 });
      }
      dataToUpdate.email = email;
    }
    if (Object.keys(dataToUpdate).length === 0) {
      return NextResponse.json({ error: 'لا توجد حقول قابلة للتعديل في الطلب' }, { status: 400 });
    }

    // Remember the current login email so a change can be announced.
    const before = await prisma.participant.findUnique({ where: { id }, select: { email: true } });
    if (!before) return NextResponse.json({ error: 'المشارك غير موجود' }, { status: 404 });

    const updatedParticipant = await prisma.participant.update({
      where: { id },
      data: dataToUpdate,
      select: PARTICIPANT_PUBLIC_FIELDS,
    });

    // The login email changed: send fresh credentials to the new address and a
    // notice to the old one (see src/lib/reactivation.ts). Never fails the edit.
    let emailChange: { credentialsSent: boolean } | undefined;
    if (typeof dataToUpdate.email === 'string' && dataToUpdate.email !== before.email.toLowerCase()) {
      emailChange = await notifyEmailChanged(id, before.email);
    }

    return NextResponse.json(emailChange ? { ...updatedParticipant, emailChange } : updatedParticipant);
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === 'P2002') {
      return NextResponse.json({ error: 'البريد الإلكتروني مستخدم مسبقاً لمشارك آخر' }, { status: 409 });
    }
    if (code === 'P2025') {
      return NextResponse.json({ error: 'المشارك غير موجود' }, { status: 404 });
    }
    console.error('Error updating participant:', error);
    return NextResponse.json({ error: 'Failed to update participant' }, { status: 500 });
  }
}

/** Profile fields an admin or team leader may edit through this route. */
const EDITABLE_FIELDS = [
  'email',
  'contactNumber',
  'phoneNumber',
  'gender',
  'isUniversityStudent',
  'university',
  'universityMajor',
  'professionalField',
  'city',
  'canAttendHackathon',
  'firstName',
  'secondName',
  'familyName',
  'nationalId',
  'dob',
  'education',
  'major',
  'employmentStatus',
  'nationality',
  'residence',
  'canAttend',
] as const;
const BOOLEAN_FIELDS = new Set(['isUniversityStudent', 'canAttendHackathon', 'canAttend']);
// Also allow PATCH requests for compatibility, though we'll use POST
export async function PATCH(req: Request) {
  return POST(req);
}
