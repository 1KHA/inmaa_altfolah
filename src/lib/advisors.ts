import bcrypt from 'bcryptjs';
import { prisma } from './prisma';
import { dispatchNotification } from './notify';
import { generatePassword, getLoginUrl } from './credentials';

/**
 * Advisor accounts (practice-card reviewers), managed by admins on
 * /admin-hackton-dashboard/advisors. An advisor never chooses a first
 * password: one is generated, stored hashed, emailed to them
 * (advisorAccountCreated) and shown once to the admin as a fallback.
 */

export const normalizeAdvisorEmail = (email: string) => email.trim().toLowerCase();

/** True when another kind of account already signs in with this email (login checks those first). */
export async function emailTakenByOtherAccount(email: string): Promise<boolean> {
  const [participant, mentor] = await Promise.all([
    prisma.participant.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } }),
    prisma.mentor.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } }),
  ]);
  return Boolean(participant || mentor);
}

/** New password for the advisor, emailed to them; returns it for the admin to see once. */
export async function issueAdvisorPassword(advisor: { id: string; name: string; email: string }): Promise<string> {
  const password = generatePassword();
  await prisma.advisor.update({
    where: { id: advisor.id },
    data: { passwordHash: await bcrypt.hash(password, 10) },
  });

  try {
    await dispatchNotification({
      templateKey: 'advisorAccountCreated',
      audience: { kind: 'advisor', id: advisor.id },
      // Per-recipient so the password is only ever emailed to its owner
      perRecipient: {
        [advisor.id]: { advisorName: advisor.name, email: advisor.email, password, loginUrl: getLoginUrl() },
      },
    });
  } catch (error) {
    console.error('Error sending advisor credentials:', error);
  }
  return password;
}

export const ADVISOR_PUBLIC_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  specialty: true,
  isDisabled: true,
  createdAt: true,
} as const;
