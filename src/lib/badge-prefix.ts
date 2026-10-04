/**
 * Badge-code prefixes, shared by the server (generation, src/lib/badge.ts)
 * and the admin scanner, which ignores QR reads without one. No server
 * imports here, so the client bundle can use it.
 */
export const BADGE_PREFIX = 'INMAA-';

/**
 * Prefixes issued before INMAA-. Such a code is replaced with an INMAA- one the
 * next time its participant opens their badge; until then it still scans.
 */
const LEGACY_BADGE_PREFIXES = ['MAYDA-'];

export function isLegacyBadgeCode(code: string): boolean {
  return LEGACY_BADGE_PREFIXES.some((prefix) => code.startsWith(prefix));
}

export function hasBadgePrefix(code: string): boolean {
  return code.startsWith(BADGE_PREFIX) || isLegacyBadgeCode(code);
}
