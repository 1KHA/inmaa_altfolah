/**
 * 5-minute-before reminders for mentor bookings.
 *
 * Runs from GET /api/cron/booking-reminders (Vercel Cron every minute; the
 * Docker entrypoint polls it locally). For every live booking whose slot
 * starts within REMINDER_MINUTES from now and that has not been reminded yet:
 *   - the participant AND their whole team get `bookingReminderParticipant`
 *     (dashboard + email);
 *   - the slot's mentor — or, for organization bookings, every active member
 *     of that organization — gets `bookingReminderMentor`;
 * with the Riyadh-formatted start time and the platform's tracked meeting
 * link. `reminderSentAt` is claimed first (updateMany guarded on NULL) so two
 * overlapping ticks can never send twice.
 */
import { prisma } from './prisma';
import { dispatchNotification } from './notify';
import { formatRiyadhDateTime } from './format-dates';
import { getMeetingJoinUrl } from './meeting';
import { BOOKABLE_MENTOR_WHERE } from './organizations';
import { participantDisplayName } from './credentials';

export const REMINDER_MINUTES = 5;
/** Also catch a start time a tick or two ago if a cron run was missed. */
const GRACE_MINUTES = 2;
/**
 * Timing: the cron runs every minute and picks up a booking the first time
 * its start is within REMINDER_MINUTES, so the reminder goes out 4–5 minutes
 * before the session (never earlier than 5). A booking made with less than
 * 5 minutes to go is reminded immediately.
 */

export interface ReminderRunResult {
  due: number;
  reminded: number;
  bookingIds: string[];
}

export async function sendDueBookingReminders(now: Date = new Date()): Promise<ReminderRunResult> {
  const windowEnd = new Date(now.getTime() + REMINDER_MINUTES * 60_000);
  const windowStart = new Date(now.getTime() - GRACE_MINUTES * 60_000);

  const due = await prisma.mentorBooking.findMany({
    where: {
      status: 'booked',
      reminderSentAt: null,
      availability: { startTime: { gte: windowStart, lte: windowEnd } },
    },
    select: {
      id: true,
      organizationId: true,
      participant: { select: { id: true, teamId: true, fullName: true, firstName: true, secondName: true, familyName: true, email: true } },
      availability: { select: { startTime: true, mentor: { select: { id: true, name: true } } } },
    },
  });

  const result: ReminderRunResult = { due: due.length, reminded: 0, bookingIds: [] };
  for (const b of due) {
    // Claim it — only one worker wins.
    const claimed = await prisma.mentorBooking.updateMany({
      where: { id: b.id, reminderSentAt: null },
      data: { reminderSentAt: now },
    });
    if (claimed.count === 0) continue;

    // The reminder is the "5 minutes before" reminder: say 5, not the exact
    // remaining minutes (a cron tick lands anywhere inside the 5-minute window).
    const minutes = String(REMINDER_MINUTES);
    const shared = {
      dateTime: formatRiyadhDateTime(b.availability.startTime),
      meetingLink: getMeetingJoinUrl(b.id),
      minutes,
    };
    const participantName = participantDisplayName(b.participant);
    const mentorName = b.availability.mentor.name;

    try {
      // Participant side: the whole team when there is one, else the individual.
      await dispatchNotification({
        templateKey: 'bookingReminderParticipant',
        variables: { ...shared, mentorName },
        audience: b.participant.teamId ? { kind: 'team', teamId: b.participant.teamId } : { kind: 'participant', id: b.participant.id },
        relatedEntityType: 'booking',
        relatedEntityId: b.id,
      });

      // Mentor side: slot owner, or every bookable member of the organization.
      const mentorIds = b.organizationId
        ? (await prisma.mentor.findMany({ where: { organizationId: b.organizationId, ...BOOKABLE_MENTOR_WHERE }, select: { id: true } })).map((m) => m.id)
        : [b.availability.mentor.id];
      for (const mentorId of mentorIds) {
        await dispatchNotification({
          templateKey: 'bookingReminderMentor',
          variables: { ...shared, participantName },
          audience: { kind: 'mentor', id: mentorId },
          relatedEntityType: 'booking',
          relatedEntityId: b.id,
        });
      }
      result.reminded++;
      result.bookingIds.push(b.id);
    } catch (error) {
      console.error(`[booking-reminders] booking ${b.id} failed:`, error);
    }
  }
  return result;
}
