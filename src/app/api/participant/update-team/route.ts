import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PARTICIPANT_PUBLIC_FIELDS } from '@/lib/participant-fields';
import jwt from 'jsonwebtoken';
import { requireActiveParticipant, isEffectivelyDisabled, DISABLED_ACCOUNT_MESSAGE } from '@/lib/account-status';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export async function POST(req: NextRequest) {
  try {
    // Get token from cookies
    const token = req.cookies.get('token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Authentication token not found.' }, { status: 401 });
    }

    // Verify token
    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET) as any;
    } catch (err) {
      return NextResponse.json({ error: 'Invalid or expired token.' }, { status: 401 });
    }

    // Get participant ID from token
    const currentUserId = decoded.participantId;
    const blocked_ = await requireActiveParticipant(currentUserId);
    if (blocked_) return blocked_;

    
    if (!currentUserId) {
      return NextResponse.json({ error: 'Participant ID not found in token.' }, { status: 401 });
    }

    // Get participant to check team membership and leadership status
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

    // Verify that the participant is the team leader
    if (!isLeader) {
      return NextResponse.json({ error: 'Only team leaders can update team information.' }, { status: 403 });
    }

    // Get request body
    const { 
      teamName, 
      ideaName,
      ideaDescription,
      challenge,
      challengeReason,
      ideaSolution,
      ideaResults,
      ideaStage,
      hearAboutUs,
      hasParticipated,
      participationDetails,
      attachmentsLink
    } = await req.json();

    // Build the data to update for the team
    const dataToUpdate: any = {};
    
    // Team basic info
    if (teamName !== undefined) dataToUpdate.teamName = teamName;
    
    // Idea details
    if (ideaName !== undefined) dataToUpdate.ideaName = ideaName;
    if (ideaDescription !== undefined) dataToUpdate.ideaDescription = ideaDescription;
    if (challenge !== undefined) dataToUpdate.challenge = challenge;
    if (challengeReason !== undefined) dataToUpdate.challengeReason = challengeReason;
    if (ideaSolution !== undefined) dataToUpdate.ideaSolution = ideaSolution;
    if (ideaResults !== undefined) dataToUpdate.ideaResults = ideaResults;
    if (ideaStage !== undefined) dataToUpdate.ideaStage = ideaStage;
    
    // Additional info
    if (hearAboutUs !== undefined) dataToUpdate.hearAboutUs = hearAboutUs;
    if (hasParticipated !== undefined) dataToUpdate.hasParticipated = hasParticipated;
    if (participationDetails !== undefined) dataToUpdate.participationDetails = participationDetails;
    if (attachmentsLink !== undefined) dataToUpdate.attachmentsLink = attachmentsLink;

    // Update the team
    const updatedTeam = await prisma.team.update({
      where: { id: teamId },
      data: dataToUpdate,
      include: { participants: { select: PARTICIPANT_PUBLIC_FIELDS } }
    });

    // Add a computed fullName to each participant
    const participantsWithFullName = updatedTeam.participants.map(p => ({
      ...p,
      fullName: p.fullName || [p.firstName, p.secondName, p.familyName].filter(Boolean).join(' ').trim() || p.email || 'غير متوفر',
    }));

    return NextResponse.json({
      ...updatedTeam,
      participants: participantsWithFullName,
      currentUser: {
        id: currentUserId,
        isLeader: isLeader,
      },
    });
  } catch (error) {
    console.error('Error updating team:', error);
    return NextResponse.json({ error: 'Failed to update team' }, { status: 500 });
  }
}
