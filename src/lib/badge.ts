import crypto from 'crypto';
import { prisma } from './prisma';
import { BADGE_PREFIX, isLegacyBadgeCode } from './badge-prefix';

/**
 * Badge codes for the QR attendance system.
 *
 * Random opaque tokens: INMAA- + 12 uppercase base32 chars (~60 bits).
 * Every scan is verified server-side, so no signing is needed — the code is
 * just a lookup key. The prefix lets the scanner ignore stray QR reads.
 */

const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'; // no I/L/O/U/0/1 — print-legible
const CODE_LENGTH = 12;

export function generateBadgeCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return BADGE_PREFIX + code;
}

export function isBadgeCodeShaped(value: string): boolean {
  return new RegExp(`^${BADGE_PREFIX}[${ALPHABET}]{${CODE_LENGTH}}$`).test(value);
}

/**
 * Return the participant's badge code, generating and persisting one on first
 * use — or replacing a code with a legacy prefix (MAYDA-), so the card always
 * shows the current one. Attendance rows reference the participant, not the
 * code, so a replacement loses nothing. Retries on the (astronomically
 * unlikely) unique-collision.
 */
export async function getOrCreateBadgeCode(participantId: string): Promise<string> {
  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    select: { badgeCode: true },
  });

  if (!participant) throw new Error('participant not found');
  if (participant.badgeCode && !isLegacyBadgeCode(participant.badgeCode)) return participant.badgeCode;

  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateBadgeCode();
    try {
      await prisma.participant.update({
        where: { id: participantId },
        data: { badgeCode: code },
      });
      return code;
    } catch (error: unknown) {
      // P2002 = unique collision on badgeCode — regenerate and retry
      if ((error as { code?: string })?.code === 'P2002') continue;
      throw error;
    }
  }

  throw new Error('failed to generate a unique badge code');
}
