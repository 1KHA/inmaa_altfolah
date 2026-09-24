/**
 * Per-participant booking limit (TeamSettings.maxBookingsPerMentor).
 *
 * A participant may hold at most N non-cancelled bookings with the same
 * mentor (individual booking) or the same organization (organization
 * booking). Cancelled bookings never count — cancelling (by admin or mentor)
 * frees the slot in the count. Bookings created before
 * TeamSettings.bookingCountResetAt don't count either: "reset all counts" just
 * stamps that mark, so everyone starts a fresh count without touching data.
 */
import { prisma } from './prisma';
import { getTeamSettings } from './team-settings';

export const DEFAULT_MAX_BOOKINGS_PER_MENTOR = 3;
export const MAX_ALLOWED_LIMIT = 20;

export async function getBookingLimit(): Promise<{ max: number; resetAt: Date | null }> {
  const s = (await getTeamSettings()) as { maxBookingsPerMentor?: number; bookingCountResetAt?: Date | null };
  return { max: s.maxBookingsPerMentor ?? DEFAULT_MAX_BOOKINGS_PER_MENTOR, resetAt: s.bookingCountResetAt ?? null };
}

/** Non-cancelled bookings by the participant with this mentor, since the reset mark. */
export async function countBookingsWithMentor(participantId: string, mentorId: string, resetAt: Date | null): Promise<number> {
  return prisma.mentorBooking.count({
    where: {
      participantId,
      status: { not: 'cancelled' },
      availability: { mentorId },
      ...(resetAt ? { createdAt: { gt: resetAt } } : {}),
    },
  });
}

/** Non-cancelled bookings by the participant with this organization, since the reset mark. */
export async function countBookingsWithOrganization(participantId: string, organizationId: string, resetAt: Date | null): Promise<number> {
  return prisma.mentorBooking.count({
    where: {
      participantId,
      status: { not: 'cancelled' },
      organizationId,
      ...(resetAt ? { createdAt: { gt: resetAt } } : {}),
    },
  });
}

export const limitMessage = (kind: 'mentor' | 'organization', max: number) =>
  kind === 'mentor'
    ? `وصلت إلى الحد الأقصى للحجوزات مع هذا الموجه (${max}). يمكنك الحجز مع موجه آخر أو الانتظار حتى يُلغى أحد حجوزاتك.`
    : `وصلت إلى الحد الأقصى للحجوزات مع هذه الجهة (${max}). يمكنك الحجز مع جهة أخرى أو الانتظار حتى يُلغى أحد حجوزاتك.`;
