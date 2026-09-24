import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/notification-auth';
import { PARTICIPANT_PUBLIC_FIELDS } from '@/lib/participant-fields';
import { dispatchNotification } from '@/lib/notify';
import { participantDisplayName } from '@/lib/credentials';

export async function POST(req: Request) {
  if (!requireAdmin(cookies().get('token')?.value)) {
    return NextResponse.json({ error: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' }, { status: 401 });
  }
  try {
    const {
      teamId, 
      teamName, 
      hackathonTrack,
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
      attachmentsLink,
      attachmentPath,
      newLeaderId
    } = await req.json();

    if (!teamId) {
      return NextResponse.json({ error: 'Team ID is required' }, { status: 400 });
    }

    // First, check if the team exists
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: { participants: { select: PARTICIPANT_PUBLIC_FIELDS } }
    });

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // If changing leader, validate that the new leader is a member of the team
    if (newLeaderId) {
      const isTeamMember = team.participants.some(p => p.id === newLeaderId);
      
      if (!isTeamMember) {
        return NextResponse.json({ 
          error: 'The new leader must be a member of the team' 
        }, { status: 400 });
      }
    }

    // Build the data to update for the team
    const dataToUpdate: any = {};
    
    // Team basic info
    if (teamName !== undefined) dataToUpdate.teamName = teamName;
    if (hackathonTrack !== undefined) dataToUpdate.hackathonTrack = hackathonTrack;
    
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
    if (attachmentPath !== undefined) dataToUpdate.attachmentPath = attachmentPath;

    // Start a transaction to update both team and participants if needed
    const result = await prisma.$transaction(async (tx) => {
      // Update the team
      const updatedTeam = await tx.team.update({
        where: { id: teamId },
        data: dataToUpdate,
        include: { participants: { select: PARTICIPANT_PUBLIC_FIELDS } }
      });

      // If changing leader, update participant records
      if (newLeaderId) {
        // First, set all participants as non-leaders
        await tx.participant.updateMany({
          where: { teamId: teamId },
          data: { isLeader: false }
        });

        // Then, set the new leader
        await tx.participant.update({
          where: { id: newLeaderId },
          data: { isLeader: true }
        });

        // Refresh the team data to include updated participants
        return await tx.team.findUnique({
          where: { id: teamId },
          include: { participants: { select: PARTICIPANT_PUBLIC_FIELDS } }
        });
      }

      return updatedTeam;
    });

    // Tell the team when leadership actually moved (best-effort).
    const previousLeaderId = team.participants.find((p) => p.isLeader)?.id;
    if (newLeaderId && newLeaderId !== previousLeaderId) {
      try {
        const newLeader = team.participants.find((p) => p.id === newLeaderId);
        await dispatchNotification({
          templateKey: 'teamLeaderChanged',
          variables: { teamName: team.teamName || 'فريقك', newLeaderName: newLeader ? participantDisplayName(newLeader) : '' },
          audience: { kind: 'team', teamId },
          relatedEntityType: 'team',
          relatedEntityId: teamId,
        });
      } catch (notificationError) {
        console.error('Error notifying team about leader change:', notificationError);
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating team:', error);
    return NextResponse.json({ error: 'Failed to update team' }, { status: 500 });
  }
}
