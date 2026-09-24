/**
 * One place that cancels a mentor booking and tells everyone.
 *
 * Used by: admin booking PATCH(status=cancelled)/DELETE, admin slot delete,
 * mentor slot delete. Whatever the trigger, the outcome is the same:
 *   - booking.status = 'cancelled' (the row is kept — history + reporting);
 *   - the participant and their whole team get `bookingCancelledParticipant`
 *     (dashboard + email);
 *   - the mentor gets `bookingCancellation` (existing template) unless the
 *     mentor is the one who cancelled.
 * A cancelled booking no longer counts toward the participant's booking
 * limit, so they can book again.
 */
import { prisma } from './prisma';
import { dispatchNotification } from './notify';
import { formatRiyadhDateTime } from './format-dates';
import { participantDisplayName } from './credentials';

export type CancelledBy = 'admin' | 'mentor';

const BOOKING_SELECT = {
  id: true,
  status: true,
  participant: { select: { id: true, teamId: true, email: true, fullName: true, firstName: true, secondName: true, familyName: true } },
  availability: { select: { startTime: true, mentor: { select: { id: true, name: true } } } },
} as const;

/** Cancel one booking (no-op if already cancelled) and notify both sides. */
export async function cancelBookingAndNotify(bookingId: string, by: CancelledBy): Promise<boolean> {
  const booking = await prisma.mentorBooking.findUnique({ where: { id: bookingId }, select: BOOKING_SELECT });
  if (!booking || booking.status === 'cancelled') return false;

  const res = await prisma.mentorBooking.updateMany({ where: { id: bookingId, status: { not: 'cancelled' } }, data: { status: 'cancelled' } });
  if (res.count === 0) return false;

  const dateTime = formatRiyadhDateTime(booking.availability.startTime);
  const mentorName = booking.availability.mentor.name;
  const participantName = participantDisplayName(booking.participant);
  const cancelledBy = by === 'mentor' ? 'الموجه' : 'إدارة الهاكاثون';

  try {
    await dispatchNotification({
      templateKey: 'bookingCancelledParticipant',
      variables: { mentorName, dateTime, cancelledBy },
      audience: booking.participant.teamId ? { kind: 'team', teamId: booking.participant.teamId } : { kind: 'participant', id: booking.participant.id },
      relatedEntityType: 'booking',
      relatedEntityId: booking.id,
    });
  } catch (error) {
    console.error('[booking-cancel] participant notification failed:', error);
  }
  if (by !== 'mentor') {
    try {
      await dispatchNotification({
        templateKey: 'bookingCancellation',
        variables: { participantName, dateTime },
        audience: { kind: 'mentor', id: booking.availability.mentor.id },
        relatedEntityType: 'booking',
        relatedEntityId: booking.id,
      });
    } catch (error) {
      console.error('[booking-cancel] mentor notification failed:', error);
    }
  }
  return true;
}

/**
 * Cancel every live booking on a slot before the slot is deleted, notifying
 * everyone. Returns how many bookings were cancelled.
 */
export async function cancelBookingsOnSlot(availabilityId: string, by: CancelledBy): Promise<number> {
  const live = await prisma.mentorBooking.findMany({ where: { availabilityId, status: { not: 'cancelled' } }, select: { id: true } });
  let n = 0;
  for (const b of live) if (await cancelBookingAndNotify(b.id, by)) n++;
  return n;
}
