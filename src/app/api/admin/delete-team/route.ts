import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/notification-auth';

export async function POST(request: NextRequest) {
  if (!requireAdmin(cookies().get('token')?.value)) {
    return NextResponse.json({ error: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' }, { status: 401 });
  }
  try {
    // Ensure we're in a runtime environment, not build time
    if (!process.env.DATABASE_URL && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Database not available' }, { status: 503 });
    }

    const { teamId } = await request.json();

    if (!teamId) {
      return NextResponse.json({ error: 'Team ID is required' }, { status: 400 });
    }

    // Get all participants in the team
    const participants = await prisma.participant.findMany({
      where: { teamId: teamId },
      select: { id: true }
    });
    
    const participantIds = participants.map(p => p.id);
    
    // 1. Delete all related records first
    
    // Delete TeamJoinRequests (both sent by team members and received by the team)
    await prisma.teamJoinRequest.deleteMany({
      where: {
        OR: [
          { participantId: { in: participantIds } },
          { teamId: teamId }
        ]
      }
    });
    
    // Delete MentorBookings for team participants
    await prisma.mentorBooking.deleteMany({
      where: {
        participantId: { in: participantIds }
      }
    });
    
    // Delete MilestoneSubmissions for team participants
    await prisma.milestoneSubmission.deleteMany({
      where: {
        participantId: { in: participantIds }
      }
    });
    
    // Delete EventRegistrations for team participants
    await prisma.eventRegistration.deleteMany({
      where: {
        participantId: { in: participantIds }
      }
    });

    // Delete AttendanceRecords for team participants (added with the
    // attendance feature; has no onDelete: Cascade, so it must be cleaned
    // up here like the other dependents or the participant delete fails)
    await prisma.attendanceRecord.deleteMany({
      where: {
        participantId: { in: participantIds }
      }
    });
    
    // 2. Now delete participants associated with the team
    await prisma.participant.deleteMany({
      where: {
        teamId: teamId,
      },
    });

    // 3. Finally, delete the team
    await prisma.team.delete({
      where: {
        id: teamId,
      },
    });

    return NextResponse.json({ message: 'Team deleted successfully' });
  } catch (error) {
    console.error('Error deleting team:', error);
    return NextResponse.json({ error: 'Failed to delete team' }, { status: 500 });
  }
}

// Ensure this route is dynamic
export const dynamic = 'force-dynamic';
