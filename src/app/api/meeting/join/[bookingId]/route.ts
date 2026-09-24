import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/notification-auth';
import { isSecureRequest } from '@/lib/cookie-security';
import { JOIN_WINDOW_BEFORE_MIN, JOIN_WINDOW_AFTER_MIN, JOIN_MAX_GAP_MIN } from '@/lib/meeting';

/**
 * GET /api/meeting/join/<bookingId> — the platform's meeting link.
 *
 * Records that the caller opened the session's meeting (first click per role:
 * MentorBooking.participantJoinedAt / mentorJoinedAt), marks the booking
 * `completed` once BOTH sides have joined, then redirects to the Jitsi room.
 * See Meeting_Trigger.md, layer 1.
 *
 * Who may join:
 *   - the booking's participant, or a teammate of theirs (team bookings)
 *   - the mentor who owns the slot, or — for organization bookings — any
 *     mentor of that organization
 *   - an admin (redirected, nothing recorded)
 * Anyone else gets 403; an anonymous click is sent to the login page.
 *
 * Attendance is only recorded for clicks inside the session window — from
 * JOIN_WINDOW_BEFORE_MIN before the slot starts to JOIN_WINDOW_AFTER_MIN after
 * it ends — and the booking is completed only when the two sides' first
 * clicks are within JOIN_MAX_GAP_MIN of each other. A click outside the window
 * still redirects (a meeting link is never "broken"); it just doesn't count.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { bookingId: string } }) {
  const claims = verifyToken(cookies().get('token')?.value);
  if (!claims) {
    // Build the login URL from what the browser actually used (host header +
    // forwarded proto): inside Docker/behind a proxy `request.nextUrl.origin`
    // is the internal address (http://0.0.0.0:3000), not the public one.
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || request.nextUrl.host;
    const proto = isSecureRequest(request) ? 'https' : 'http';
    return NextResponse.redirect(`${proto}://${host}/login`);
  }

  const booking = await prisma.mentorBooking.findUnique({
    where: { id: params.bookingId },
    select: {
      id: true,
      status: true,
      meetingUrl: true,
      organizationId: true,
      participantJoinedAt: true,
      mentorJoinedAt: true,
      participant: { select: { id: true, teamId: true } },
      availability: { select: { startTime: true, endTime: true, mentor: { select: { id: true, organizationId: true } } } },
    },
  });
  if (!booking) return NextResponse.json({ error: 'الحجز غير موجود' }, { status: 404 });
  if (booking.status === 'cancelled') return NextResponse.json({ error: 'هذا الحجز ملغي' }, { status: 410 });
  if (!booking.meetingUrl) return NextResponse.json({ error: 'لا يوجد رابط اجتماع لهذا الحجز' }, { status: 400 });

  let role: 'participant' | 'mentor' | 'admin' | null = null;
  if (claims.role === 'admin') {
    role = 'admin';
  } else if (claims.role === 'participant') {
    const callerId = claims.participantId || claims.id;
    if (callerId === booking.participant.id) role = 'participant';
    else if (booking.participant.teamId) {
      const caller = await prisma.participant.findUnique({ where: { id: callerId }, select: { teamId: true } });
      if (caller?.teamId === booking.participant.teamId) role = 'participant';
    }
  } else if (claims.role === 'mentor') {
    const callerId = claims.mentorId || claims.id;
    const slotMentor = booking.availability.mentor;
    if (callerId === slotMentor.id) role = 'mentor';
    else if (booking.organizationId) {
      const caller = await prisma.mentor.findUnique({ where: { id: callerId }, select: { organizationId: true } });
      if (caller?.organizationId === booking.organizationId) role = 'mentor';
    }
  }
  if (!role) return NextResponse.json({ error: 'غير مصرح لك بالانضمام إلى هذا الاجتماع' }, { status: 403 });

  const now = new Date();
  const windowStart = new Date(booking.availability.startTime.getTime() - JOIN_WINDOW_BEFORE_MIN * 60_000);
  const windowEnd = new Date(booking.availability.endTime.getTime() + JOIN_WINDOW_AFTER_MIN * 60_000);
  const insideWindow = now >= windowStart && now <= windowEnd;

  if (role !== 'admin' && insideWindow) {
    const stamp: Record<string, Date> = {};
    if (role === 'participant' && !booking.participantJoinedAt) stamp.participantJoinedAt = now;
    if (role === 'mentor' && !booking.mentorJoinedAt) stamp.mentorJoinedAt = now;
    if (Object.keys(stamp).length > 0) {
      const mentorJoined = booking.mentorJoinedAt || stamp.mentorJoinedAt;
      const participantJoined = booking.participantJoinedAt || stamp.participantJoinedAt;
      const closeEnough =
        !!mentorJoined && !!participantJoined &&
        Math.abs(mentorJoined.getTime() - participantJoined.getTime()) <= JOIN_MAX_GAP_MIN * 60_000;
      const bothJoined = closeEnough;
      // Only stamp a still-null field (first click wins) and only complete a
      // live booking; a concurrent click from the other side is safe.
      await prisma.mentorBooking.update({
        where: { id: booking.id },
        data: {
          ...stamp,
          ...(bothJoined && booking.status === 'booked' ? { status: 'completed', completedAt: now } : {}),
        },
      });
    }
  }

  return NextResponse.redirect(booking.meetingUrl, { status: 302 });
}
