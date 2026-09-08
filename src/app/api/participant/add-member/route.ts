import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PARTICIPANT_PUBLIC_FIELDS } from '@/lib/participant-fields';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { requireActiveParticipant, isEffectivelyDisabled, DISABLED_ACCOUNT_MESSAGE } from '@/lib/account-status';
import { getTeamSettings, memberAddWindowState } from '@/lib/team-settings';
import bcrypt from 'bcryptjs';
import { dispatchNotification } from '@/lib/notify';
import { generatePassword, credentialVariables, participantDisplayName } from '@/lib/credentials';
import { TEAM_MAX_MEMBERS } from '@/lib/constants';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

interface JwtPayload {
  participantId: string;
  email: string;
  role: string;
  teamId?: string;
  isLeader?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const tokenCookie = cookieStore.get('token');

    if (!tokenCookie) {
      return NextResponse.json({ error: 'Authentication token not found.' }, { status: 401 });
    }

    const token = tokenCookie.value;
    let decoded: JwtPayload;

    try {
      decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    } catch (err) {
      return NextResponse.json({ error: 'Invalid or expired token.' }, { status: 401 });
    }

    // Authorization: Only team leaders can add members
    if (!decoded.isLeader) {
      return NextResponse.json({ error: 'Only team leaders can add members.' }, { status: 403 });
    }

    const { teamId } = decoded;
    const blocked_ = await requireActiveParticipant(decoded.participantId);
    if (blocked_) return blocked_;

    if (!teamId) {
      return NextResponse.json({ error: 'لا يوجد فريق مرتبط بحسابك.' }, { status: 400 });
    }

    // Admin-controlled window: leaders may only add members between the
    // start/end dates configured in TeamSettings.
    const settings = await getTeamSettings();
    const windowState = memberAddWindowState(settings);
    if (!windowState.allowed) {
      return NextResponse.json({ error: windowState.message }, { status: 403 });
    }

    // Team size cap (leader + members).
    const memberCount = await prisma.participant.count({ where: { teamId } });
    if (memberCount >= TEAM_MAX_MEMBERS) {
      return NextResponse.json(
        { error: `وصل الفريق إلى الحد الأقصى لعدد الأعضاء (${TEAM_MAX_MEMBERS} عضواً).` },
        { status: 400 }
      );
    }

    const newMemberData = await request.json();

    // Validation
    if (!newMemberData.email || !newMemberData.firstName || !newMemberData.nationalId) {
        return NextResponse.json({ error: 'Required fields are missing.' }, { status: 400 });
    }

    // Check if email already exists
    const existingParticipant = await prisma.participant.findUnique({
        where: { email: newMemberData.email },
    });

    if (existingParticipant) {
        return NextResponse.json({ error: 'This email is already registered.' }, { status: 409 });
    }

    // The member is accepted automatically (no admin review step), so issue
    // login credentials right away: generate a password, store it hashed, and
    // email it to the new member — the same flow as team approval.
    const password = generatePassword();
    const passwordHash = await bcrypt.hash(password, 10);

    const newParticipant = await prisma.participant.create({
      data: {
        ...newMemberData,
        isLeader: false, // New members are never leaders
        teamId: teamId,
        status: 'approved',
        passwordHash,
      },
      select: PARTICIPANT_PUBLIC_FIELDS,
    });

    // Dashboard notification + credentials email for the new member. Never
    // blocks the add; if email is disabled the member can still use
    // "نسيت كلمة المرور" on the login page.
    try {
      const team = await prisma.team.findUnique({
        where: { id: teamId },
        select: { teamName: true },
      });
      const name = participantDisplayName({ ...newMemberData, email: newMemberData.email });
      await dispatchNotification({
        templateKey: 'memberAddedByLeader',
        variables: { teamName: team?.teamName || 'فريقك' },
        perRecipient: {
          [newParticipant.id]: credentialVariables({
            email: newMemberData.email,
            password,
            participantName: name,
          }),
        },
        audience: { kind: 'participant', id: newParticipant.id },
        relatedEntityType: 'team',
        relatedEntityId: teamId,
      });
    } catch (notificationError) {
      console.error('Error sending new-member credentials:', notificationError);
    }

    return NextResponse.json(newParticipant, { status: 201 });

  } catch (error) {
    console.error('Error adding team member:', error);
    return NextResponse.json({ error: 'Failed to add team member' }, { status: 500 });
  }
}
