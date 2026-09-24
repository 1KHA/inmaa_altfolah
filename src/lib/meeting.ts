import { getAppBaseUrl } from './credentials';
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

/** Unguessable per-booking room URL, e.g. https://meet.jit.si/Mayda-Ab3xYz9QkLmN */
export function generateMeetingUrl(): string {
  // 9 random bytes -> 12 URL-safe chars (~72 bits) — same "unlisted link"
  // security model as a Zoom/Meet invite.
  const token = crypto.randomBytes(9).toString('base64url');
  return `${getMeetingBaseUrl()}/Mayda-${token}`;
}

/** Path of the platform's tracked meeting link for a booking (see /api/meeting/join). */
export function meetingJoinPath(bookingId: string): string {
  return `/api/meeting/join/${bookingId}`;
}

/** Absolute tracked meeting link for emails. */
export function getMeetingJoinUrl(bookingId: string): string {
  return `${getAppBaseUrl()}${meetingJoinPath(bookingId)}`;
}

/**
 * Attendance window for the tracked join link (see /api/meeting/join):
 * clicks count from JOIN_WINDOW_BEFORE_MIN before the slot starts until
 * JOIN_WINDOW_AFTER_MIN after it ends; the two sides' first clicks must be
 * within JOIN_MAX_GAP_MIN of each other for the booking to be completed.
 */
export const JOIN_WINDOW_BEFORE_MIN = 10;
export const JOIN_WINDOW_AFTER_MIN = 15;
export const JOIN_MAX_GAP_MIN = 30;
