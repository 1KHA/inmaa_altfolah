import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PARTICIPANT_PUBLIC_FIELDS } from '@/lib/participant-fields';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { requireActiveParticipant, isEffectivelyDisabled, DISABLED_ACCOUNT_MESSAGE } from '@/lib/account-status';

export const dynamic = 'force-dynamic';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

interface JwtPayload {
  id: string;
  email: string;
  teamId: string;
  isLeader: boolean;
}

export async function GET(request: NextRequest) {
  try {
    // Use consistent cookie name with other endpoints
    const token = request.cookies.get('token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Authentication token not found.' }, { status: 401 });
    }

    let decoded: any;

    try {
      decoded = jwt.verify(token, JWT_SECRET) as any;
    } catch (err) {
      return NextResponse.json({ error: 'Invalid or expired token.' }, { status: 401 });
    }

    // Use consistent field names with other endpoints
    const currentUserId = decoded.participantId;
    const blocked_ = await requireActiveParticipant(currentUserId);
    if (blocked_) return blocked_;

    
    if (!currentUserId) {
      return NextResponse.json({ error: 'Participant ID not found in token.' }, { status: 401 });
    }

    // Get participant to check team membership
    const participant = await prisma.participant.findUnique({
      where: { id: currentUserId },
      select: { teamId: true, isLeader: true }
    });

    if (!participant) {
      return NextResponse.json({ error: 'Participant not found.' }, { status: 404 });
    }

    const { teamId, isLeader } = participant;

    if (!teamId) {
      return NextResponse.json({ error: 'You are not part of any team.' }, { status: 400 });
    }

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        participants: {
          select: PARTICIPANT_PUBLIC_FIELDS,
          orderBy: {
            isLeader: 'desc', // Show leader first
          },
        },
      },
    });

    if (!team) {
      return NextResponse.json({ error: 'Team not found.' }, { status: 404 });
    }

    // Add a computed fullName to each participant
    const participantsWithFullName = team.participants.map(p => ({
      ...p,
      fullName: p.fullName || [p.firstName, p.secondName, p.familyName].filter(Boolean).join(' ').trim() || p.email || 'غير متوفر',
    }));

    return NextResponse.json({
      ...team,
      participants: participantsWithFullName,
      currentUser: {
        id: currentUserId,
        isLeader: isLeader,
      },
    });

  } catch (error) {
    console.error('Error fetching team details:', error);
    return NextResponse.json({ error: 'Failed to fetch team details' }, { status: 500 });
  }
}
