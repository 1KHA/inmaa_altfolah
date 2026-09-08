import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { PARTICIPANT_PUBLIC_FIELDS } from '@/lib/participant-fields';
import jwt from "jsonwebtoken";
import { requireActiveParticipant, isEffectivelyDisabled, DISABLED_ACCOUNT_MESSAGE } from '@/lib/account-status';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    // Get the auth token from cookies
    const cookieStore = cookies();
    const token = cookieStore.get("token")?.value || cookieStore.get("auth-token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized: No token provided" }, { status: 401 });
    }

    // Verify the token and get the participant ID
    let decodedToken;
    try {
      decodedToken = jwt.verify(token, process.env.JWT_SECRET!) as { participantId?: string };
    } catch (error) {
      return NextResponse.json({ error: "Unauthorized: Invalid token" }, { status: 401 });
    }

    if (!decodedToken || !decodedToken.participantId) {
      return NextResponse.json({ error: "Unauthorized: Invalid token" }, { status: 401 });
    }

    const currentParticipantId = decodedToken.participantId;
    const blocked_ = await requireActiveParticipant(currentParticipantId);
    if (blocked_) return blocked_;


    // Get the request body
    const body = await request.json();
    const { participantId } = body;

    if (!participantId) {
      return NextResponse.json({ error: "Participant ID is required" }, { status: 400 });
    }

    // Get the current participant to check if they are a team leader
    const currentParticipant = await prisma.participant.findUnique({
      where: { id: currentParticipantId },
      include: { team: { include: { participants: { select: PARTICIPANT_PUBLIC_FIELDS } } } },
    });

    if (!currentParticipant) {
      return NextResponse.json({ error: "Participant not found" }, { status: 404 });
    }

    if (!currentParticipant.isLeader) {
      return NextResponse.json({ error: "Only team leaders can remove members" }, { status: 403 });
    }

    if (!currentParticipant.teamId) {
      return NextResponse.json({ error: "You are not part of a team" }, { status: 400 });
    }

    // Check if the participant to remove is in the same team
    const participantToRemove = await prisma.participant.findUnique({
      where: { id: participantId },
    });

    if (!participantToRemove) {
      return NextResponse.json({ error: "Participant to remove not found" }, { status: 404 });
    }

    if (participantToRemove.teamId !== currentParticipant.teamId) {
      return NextResponse.json({ error: "Participant is not in your team" }, { status: 400 });
    }

    // Cannot remove yourself
    if (participantId === currentParticipantId) {
      return NextResponse.json({ error: "Cannot remove yourself from the team" }, { status: 400 });
    }

    // Remove the participant from the team
    const updatedParticipant = await prisma.participant.update({
      where: { id: participantId },
      data: { 
        teamId: null,
        isLeader: false // Ensure they're not marked as a leader
      },
    });

    // Get the updated team data
    const updatedTeam = await prisma.team.findUnique({
      where: { id: currentParticipant.teamId },
      include: { participants: { select: PARTICIPANT_PUBLIC_FIELDS } },
    });

    return NextResponse.json({
      message: "Member removed successfully",
      team: updatedTeam,
    });
  } catch (error) {
    console.error("Error removing team member:", error);
    return NextResponse.json({ error: "Failed to remove team member" }, { status: 500 });
  }
}
