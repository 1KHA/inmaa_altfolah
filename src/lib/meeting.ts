import crypto from 'crypto';

/**
 * Per-booking video meeting links.
 *
 * A Jitsi room is just a URL — it springs into existence when the first
 * person opens it, so "creating" a meeting is nothing more than generating a
 * unique, unguessable room name. Every booking gets its own room; parallel
 * sessions across mentors can never collide.
 *
 * MEETING_BASE_URL switches the provider without touching any other code:
 * default is the free public instance; point it at a self-hosted Jitsi (or
 * 8x8.vc tenant) later and new bookings pick it up immediately.
 *
 * NOTE (meet.jit.si policy since Aug 2023): the FIRST person to open the room
 * must sign in (Google/GitHub/Facebook) to become moderator — everyone else
 * joins with no account. The mentor email template tells the mentor this.
 */
export function getMeetingBaseUrl(): string {
  return (process.env.MEETING_BASE_URL || 'https://meet.jit.si').replace(/\/+$/, '');
}

/** Unguessable per-booking room URL, e.g. https://meet.jit.si/Miyahthone-Ab3xYz9QkLmN */
export function generateMeetingUrl(): string {
  // 9 random bytes -> 12 URL-safe chars (~72 bits) — same "unlisted link"
  // security model as a Zoom/Meet invite.
  const token = crypto.randomBytes(9).toString('base64url');
  return `${getMeetingBaseUrl()}/Miyahthone-${token}`;
}
