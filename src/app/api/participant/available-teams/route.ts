import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';
import { requireActiveParticipant } from '@/lib/account-status';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Get JWT token from cookies
    const token = request.cookies.get('token')?.value;
    
    if (!token) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { participantId: string };

    // Disabled accounts cannot act (see src/lib/account-status.ts)
    const blocked_ = await requireActiveParticipant(decoded.participantId);
    if (blocked_) return blocked_;

    
    // Get current participant to check if they have a team
    const currentParticipant = await prisma.participant.findUnique({
      where: { id: decoded.participantId },
      select: { teamId: true }
    });

    if (!currentParticipant) {
      return NextResponse.json({ error: 'المشارك غير موجود' }, { status: 404 });
    }

    // Only participants without teams can view available teams
    if (currentParticipant.teamId) {
      return NextResponse.json({ error: 'أنت عضو في فريق بالفعل' }, { status: 403 });
    }

    // Get all approved teams first
    const allApprovedTeams = await prisma.team.findMany({
      where: {
        status: 'approved',
        // A disabled team is not joinable and must not even be listed.
        isDisabled: false
      },
      include: {
        participants: {
          select: {
            id: true,
            fullName: true,
            firstName: true,
            secondName: true,
            familyName: true,
            isLeader: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Filter teams with less than 5 members and format the response
    const formattedTeams = allApprovedTeams
      .filter(team => team.participants.length < 5)
      .map(team => {
        const leader = team.participants.find(p => p.isLeader);
        const leaderName = leader?.fullName || 
                          (leader ? (leader.fullName || [leader.firstName, leader.secondName, leader.familyName].filter(Boolean).join(' ').trim() || 'غير محدد') : 'غير محدد');
        
        return {
          id: team.id,
          teamName: team.teamName,
          ideaDescription: team.ideaDescription,
          ideaName: team.ideaName, // For backward compatibility
          challenge: team.challenge,
          hackathonTrack: team.hackathonTrack,
          leaderName,
          memberCount: team.participants.length,
          maxMembers: 5,
          createdAt: team.createdAt
        };
      });

    return NextResponse.json({ teams: formattedTeams });

  } catch (error) {
    console.error('Error fetching available teams:', error);
    return NextResponse.json(
      { error: 'حدث خطأ في جلب الفرق المتاحة' },
      { status: 500 }
    );
  }
}
