/**
 * Participant login credentials generated at acceptance time.
 *
 * Participants register without a password. When an admin accepts their team
 * or individual application (or a team leader accepts their join request into
 * an approved team), a password is generated here, stored hashed, and sent to
 * that participant in their acceptance email via per-recipient template
 * variables ({{email}}, {{password}}, {{loginUrl}}).
 * See mdfiles/acceptance-credentials-email.md.
 */
import crypto from 'crypto';
import { getSiteUrl } from './site';

/** Unambiguous alphabet: no 0/O, 1/l/I — the password is read from an email. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
export const PASSWORD_LENGTH = 10;

/** Cryptographically random, human-copyable password. */
export function generatePassword(length: number = PASSWORD_LENGTH): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return out;
}

/** Shown in place of {{password}} when the participant already had one. */
export const PASSWORD_UNCHANGED_TEXT = 'كلمة المرور الحالية لحسابك (لم تتغير)';

/** Public base URL of the app, for links inside emails. See src/lib/site.ts. */
export function getAppBaseUrl(): string {
  return getSiteUrl();
}

/** Participant login page (participants sign in with email + password). */
export function getLoginUrl(): string {
  return `${getAppBaseUrl()}/login`;
}

/** Template variables for an acceptance email carrying login credentials. */
export function credentialVariables(params: {
  email: string;
  password: string | null; // null => participant already had a password
  participantName?: string | null;
}): Record<string, string> {
  return {
    email: params.email,
    password: params.password ?? PASSWORD_UNCHANGED_TEXT,
    loginUrl: getLoginUrl(),
    participantName: params.participantName?.trim() || params.email.split('@')[0],
  };
}

/** Display name from the registration fields, with sensible fallback. */
export function participantDisplayName(p: {
  fullName?: string | null;
  firstName?: string | null;
  secondName?: string | null;
  familyName?: string | null;
  email: string;
}): string {
  return (
    p.fullName?.trim() ||
    [p.firstName, p.secondName, p.familyName].filter(Boolean).join(' ').trim() ||
    p.email.split('@')[0]
  );
}
