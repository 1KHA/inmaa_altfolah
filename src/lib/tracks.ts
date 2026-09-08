/**
 * Backwards-compatible aliases for src/lib/challenges.ts, which is the single
 * source of truth for the hackathon's tracks. Call sites added before the
 * upstream "challenges" naming import from here.
 */
export { CHALLENGES as HACKATHON_TRACKS, resolveChallenge, normalizeTrackText, TRACK_ALIASES } from './challenges';
export type { Challenge as HackathonTrack } from './challenges';

import { CHALLENGES } from './challenges';

/** True when `value` is one of the current tracks. */
export function isHackathonTrack(value: unknown): value is (typeof CHALLENGES)[number] {
  return typeof value === 'string' && (CHALLENGES as readonly string[]).includes(value);
}
