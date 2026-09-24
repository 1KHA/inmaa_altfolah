import { NextRequest, NextResponse } from 'next/server';
import { formatRiyadhDateTime } from '@/lib/format-dates';
import { cancelBookingAndNotify } from '@/lib/booking-cancel';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { dispatchNotification } from '@/lib/notify';

// Full participant + mentor context needed to describe a booking in a notification
const bookingWithPeople = {
  participant: {
    select: {
      id: true,
      firstName: true,
      fullName: true,
      secondName: true,
      familyName: true,
      email: true,
      phoneNumber: true,
    },
  },
  availability: {
    include: {
      mentor: {
        select: {
          id: true,
          name: true,
          email: true,
          specialty: true,
        },
      },
    },
  },
} as const;

function formatBookingDateTime(startTime: Date) {
  return formatRiyadhDateTime(startTime);
}

/**
 * Tell the mentor their session was cancelled. Best-effort: a notification
 * failure must never fail the cancellation itself.
 */
async function notifyMentorOfCancellation(booking: {
  id: string;
  participant: { firstName: string | null; secondName: string | null; familyName: string | null };
  availability: { startTime: Date; mentor: { id: string } };
}) {
  try {
    const participantName = [
      booking.participant.firstName,
      booking.participant.secondName,
      booking.participant.familyName,
    ]
      .filter(Boolean)
      .join(' ')
      .trim() || 'مشارك';

    const dateTime = formatBookingDateTime(booking.availability.startTime);

    await dispatchNotification({
      templateKey: 'bookingCancellation',
      variables: { participantName, dateTime },
      audience: { kind: 'mentor', id: booking.availability.mentor.id },
      relatedEntityType: 'booking',
      relatedEntityId: booking.id,
    });
  } catch (notificationError) {
    console.error('Error creating booking cancellation notification:', notificationError);
    // Don't fail the cancellation if notification fails
  }
}

/** Participant + team notice for an already-cancelled booking (status written by the caller). */
async function notifyParticipantOfCancellation(bookingId: string) {
  try {
    const b = await prisma.mentorBooking.findUnique({
      where: { id: bookingId },
      select: { id: true, participant: { select: { id: true, teamId: true, email: true, fullName: true, firstName: true, secondName: true, familyName: true } }, availability: { select: { startTime: true, mentor: { select: { name: true } } } } },
    });
    if (!b) return;
    await dispatchNotification({
      templateKey: 'bookingCancelledParticipant',
      variables: { mentorName: b.availability.mentor.name, dateTime: formatBookingDateTime(b.availability.startTime), cancelledBy: 'إدارة الهاكاثون' },
      audience: b.participant.teamId ? { kind: 'team', teamId: b.participant.teamId } : { kind: 'participant', id: b.participant.id },
      relatedEntityType: 'booking',
      relatedEntityId: b.id,
    });
  } catch (error) {
    console.error('Error notifying participant of cancellation:', error);
  }
}

// Helper to check admin auth
async function isAdmin(request: NextRequest) {
  const cookieStore = cookies();
  const token = cookieStore.get('token')?.value;
  if (!token) return false;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { id: string, role: string };
    return decoded.role === 'admin';
  } catch {
    return false;
  }
}

// PATCH: Update booking (status, availabilityId)
export async function PATCH(request: NextRequest, { params }: { params: { bookingId: string } }) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' }, { status: 403 });
  }

  const { bookingId } = params;
  if (!bookingId) {
    return NextResponse.json({ error: 'يجب توفير معرف الحجز.' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const dataToUpdate: { status?: string; availabilityId?: string } = {};
    if (body.status) dataToUpdate.status = body.status;
    if (body.availabilityId) dataToUpdate.availabilityId = body.availabilityId;

    // Read the prior status so re-saving an already-cancelled booking does not
    // notify the mentor a second time
    const previous = await prisma.mentorBooking.findUnique({
      where: { id: bookingId },
      select: { status: true },
    });

    const updated = await prisma.mentorBooking.update({
      where: { id: bookingId },
      data: dataToUpdate,
      include: bookingWithPeople,
    });

    if (updated.status === 'cancelled' && previous?.status !== 'cancelled') {
      // Participant + team + mentor are told (src/lib/booking-cancel.ts). The
      // status was already written above; this only sends the notifications.
      await notifyMentorOfCancellation(updated);
      await notifyParticipantOfCancellation(updated.id);
    }

    // Format response
    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      mentor: {
        id: updated.availability.mentor.id,
        name: updated.availability.mentor.name,
        email: updated.availability.mentor.email,
        specialty: updated.availability.mentor.specialty,
      },
      participant: {
        id: updated.participant.id,
        name: updated.participant.fullName || [updated.participant.firstName, updated.participant.secondName, updated.participant.familyName].filter(Boolean).join(' ').trim() || updated.participant.email,
        email: updated.participant.email,
        phoneNumber: updated.participant.phoneNumber,
      },
      availability: {
        id: updated.availability.id,
        startTime: updated.availability.startTime,
        endTime: updated.availability.endTime,
      },
    });
  } catch (error) {
    console.error('Error updating mentor booking:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء تحديث الحجز.' }, { status: 500 });
  }
}

// DELETE: Delete booking
export async function DELETE(request: NextRequest, { params }: { params: { bookingId: string } }) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' }, { status: 403 });
  }

  const { bookingId } = params;
  if (!bookingId) {
    return NextResponse.json({ error: 'يجب توفير معرف الحجز.' }, { status: 400 });
  }

  try {
    // Load the booking before deleting it — afterwards the mentor and
    // participant details needed for the notification are gone
    const booking = await prisma.mentorBooking.findUnique({
      where: { id: bookingId },
      include: bookingWithPeople,
    });

    // Deleting a live booking is a cancellation from the participant's point
    // of view: cancel + notify everyone first, then remove the row.
    if (booking && booking.status !== 'cancelled') {
      await cancelBookingAndNotify(bookingId, 'admin');
    }
    await prisma.mentorBooking.delete({
      where: { id: bookingId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting mentor booking:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء حذف الحجز.' }, { status: 500 });
  }
}
