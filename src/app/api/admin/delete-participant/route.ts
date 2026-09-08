import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/notification-auth'

export async function POST(request: NextRequest) {
  if (!requireAdmin(cookies().get('token')?.value)) {
    return NextResponse.json({ error: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' }, { status: 401 });
  }
  try {
    const { participantId } = await request.json()

    if (!participantId) {
      return NextResponse.json(
        { error: 'Participant ID is required' },
        { status: 400 }
      )
    }

    // Find the participant
    const participant = await prisma.participant.findUnique({
      where: { id: participantId }
    })

    if (!participant) {
      return NextResponse.json(
        { error: 'Participant not found' },
        { status: 404 }
      )
    }

    // Check if participant is individual (no team)
    if (participant.teamId) {
      return NextResponse.json(
        { error: 'This participant is part of a team. Cannot delete team members individually.' },
        { status: 400 }
      )
    }

    // Delete every row that references the participant, then the participant
    // itself — atomically. Participant has NO onDelete: Cascade relations, so
    // leaving any dependent row behind fails with a foreign-key violation
    // (seen in production as `EventRegistration_participantId_fkey`).
    await prisma.$transaction([
      prisma.teamJoinRequest.deleteMany({ where: { participantId } }),
      prisma.mentorBooking.deleteMany({ where: { participantId } }),
      prisma.milestoneSubmission.deleteMany({ where: { participantId } }),
      prisma.eventRegistration.deleteMany({ where: { participantId } }),
      prisma.attendanceRecord.deleteMany({ where: { participantId } }),
      // dashboard notifications are keyed by recipientId without an FK —
      // remove them too so no orphaned rows are left behind
      prisma.notification.deleteMany({
        where: { recipientType: 'participant', recipientId: participantId },
      }),
      prisma.participant.delete({ where: { id: participantId } }),
    ])

    return NextResponse.json({
      message: 'Participant deleted successfully'
    })

  } catch (error) {
    console.error('Error deleting participant:', error)
    return NextResponse.json(
      { error: 'Failed to delete participant' },
      { status: 500 }
    )
  }
}
