import { prisma } from './prisma';
import { getTeamSettings } from './team-settings';

/**
 * Organizations — groups of mentors that participants can book as a whole.
 *
 * The admin chooses how participants book (TeamSettings.mentorBookingMode):
 *   individual   — today's behaviour: pick a person, book one of their slots
 *   organization — participants only see organizations; booking one of its
 *                  slots notifies EVERY active member (+ meeting link)
 *   both         — either path is available
 *
 * An organization has no slots of its own: its bookable slots are the union
 * of its active members' future free slots. Booking "the organization" still
 * books that member's slot, flagged with organizationId so the fan-out and the
 * one-booking-per-organization rule apply. See mdfiles/organizations.md.
 */

export const BOOKING_MODES = ['individual', 'organization', 'both'] as const;
export type BookingMode = (typeof BOOKING_MODES)[number];

export const BOOKING_MODE_LABELS: Record<BookingMode, string> = {
  individual: 'الحجز مع موجه محدد فقط',
  organization: 'الحجز مع الجهة فقط (بدون إظهار الأشخاص)',
  both: 'السماح بالحجز مع الجهة أو مع موجه محدد',
};

export function isBookingMode(v: unknown): v is BookingMode {
  return typeof v === 'string' && (BOOKING_MODES as readonly string[]).includes(v);
}

export async function getBookingMode(): Promise<BookingMode> {
  const s = await getTeamSettings();
  const m = (s as { mentorBookingMode?: string }).mentorBookingMode;
  return isBookingMode(m) ? m : 'individual';
}

/** Members who can actually receive bookings. */
export const BOOKABLE_MENTOR_WHERE = { status: 'active', isDisabled: false } as const;

export interface OrgSlot {
  /** Representative availability id (a free host slot when one exists). */
  id: string;
  startTime: Date;
  endTime: Date;
  mentorId: string;
  /** Hidden (null) when the booking mode is organization-only. */
  mentorName: string | null;
  /** All members offering this exact time window. */
  hostMentorIds: string[];
  isBooked: boolean;
  isOwnBooking: boolean;
}

type ActiveBooking = { participantId: string; startTime: Date; endTime: Date };

const overlaps = (a: { startTime: Date; endTime: Date }, b: { startTime: Date; endTime: Date }) =>
  a.startTime < b.endTime && b.startTime < a.endTime;

/**
 * Every non-cancelled booking that keeps ANY member of the organization busy
 * from `from` onwards — individual bookings included. An organization session
 * is joined by all members, so the organization is busy whenever one of them is.
 */
export async function organizationActiveBookings(organizationId: string, from: Date): Promise<ActiveBooking[]> {
  const rows = await prisma.mentorBooking.findMany({
    where: {
      status: { not: 'cancelled' },
      availability: { endTime: { gte: from }, mentor: { organizationId } },
    },
    select: { participantId: true, availability: { select: { startTime: true, endTime: true } } },
  });
  return rows.map((r) => ({ participantId: r.participantId, startTime: r.availability.startTime, endTime: r.availability.endTime }));
}

/** Whether any member of the organization already has a session in this window. */
export async function organizationBusyAt(
  organizationId: string,
  window: { startTime: Date; endTime: Date }
): Promise<boolean> {
  const busy = await organizationActiveBookings(organizationId, window.startTime);
  return busy.some((b) => overlaps(b, window));
}

/**
 * Future slots of an organization, as ONE entry per time window: a slot any
 * member adds is automatically the organization's slot, and members offering
 * the same window are collapsed together. `viewerParticipantId` lets us mark
 * the viewer's own bookings; `revealMentors` controls whether host names are
 * exposed.
 */
export async function organizationSlots(
  organizationId: string,
  opts: { viewerParticipantId?: string; revealMentors: boolean }
): Promise<OrgSlot[]> {
  const now = new Date();
  const [rows, busy] = await Promise.all([
    prisma.mentorAvailability.findMany({
      where: {
        endTime: { gte: now },
        mentor: { organizationId, ...BOOKABLE_MENTOR_WHERE },
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        mentorId: true,
        mentor: { select: { name: true } },
        bookings: { select: { status: true } },
      },
      orderBy: { startTime: 'asc' },
    }),
    organizationActiveBookings(organizationId, now),
  ]);

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = `${r.startTime.getTime()}-${r.endTime.getTime()}`;
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }

  return Array.from(groups.values()).map((g) => {
    const window = { startTime: g[0].startTime, endTime: g[0].endTime };
    const conflicting = busy.filter((b) => overlaps(b, window));
    const free = g.find((r) => !r.bookings.some((b) => b.status !== 'cancelled')) ?? g[0];
    const names = Array.from(new Set(g.map((r) => r.mentor.name)));
    return {
      id: free.id,
      startTime: window.startTime,
      endTime: window.endTime,
      mentorId: free.mentorId,
      mentorName: opts.revealMentors ? names.join('، ') : null,
      hostMentorIds: g.map((r) => r.mentorId),
      isBooked: conflicting.length > 0,
      isOwnBooking: !!opts.viewerParticipantId && conflicting.some((b) => b.participantId === opts.viewerParticipantId),
    };
  });
}

/** Organizations as participants should see them (only bookable members). */
export async function listOrganizationsPublic(revealMentors: boolean) {
  const now = new Date();
  const orgs = await prisma.organization.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      description: true,
      logoUrl: true,
      mentors: {
        where: BOOKABLE_MENTOR_WHERE,
        select: {
          id: true,
          name: true,
          specialty: true,
          availabilities: {
            where: { endTime: { gte: now } },
            select: { startTime: true, endTime: true },
          },
        },
      },
    },
  });
  const busyByOrg = new Map<string, ActiveBooking[]>();
  await Promise.all(orgs.map(async (o) => busyByOrg.set(o.id, await organizationActiveBookings(o.id, now))));

  return orgs.map((o) => {
    // Same window offered by several members counts once (see organizationSlots).
    const windows = new Map<string, { startTime: Date; endTime: Date }>();
    for (const m of o.mentors) {
      for (const a of m.availabilities) windows.set(`${a.startTime.getTime()}-${a.endTime.getTime()}`, a);
    }
    const busy = busyByOrg.get(o.id) ?? [];
    const upcomingSlots = windows.size;
    let availableSlots = 0;
    windows.forEach((w) => { if (!busy.some((b) => overlaps(b, w))) availableSlots++; });
    return {
      id: o.id,
      name: o.name,
      description: o.description,
      logoUrl: o.logoUrl,
      memberCount: o.mentors.length,
      specialties: Array.from(new Set(o.mentors.map((m) => m.specialty).filter(Boolean))),
      members: revealMentors ? o.mentors.map((m) => ({ id: m.id, name: m.name, specialty: m.specialty })) : undefined,
      upcomingSlots,
      availableSlots,
    };
  });
}
