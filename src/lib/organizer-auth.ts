import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/notification-auth';

export interface OrganizerSession {
  id: string;
  username: string;
  name: string;
}

/**
 * Organizer (منظم) gate for /api/organizer/* routes. Reads the database on
 * every call so disabling an organizer takes effect immediately, not when
 * their (sliding) session token expires.
 */
export async function requireOrganizer(token: string | undefined): Promise<OrganizerSession | null> {
  const claims = verifyToken(token);
  if (!claims || claims.role !== 'organizer' || !claims.id) return null;
  const organizer = await prisma.organizer.findUnique({
    where: { id: claims.id },
    select: { id: true, username: true, name: true, isDisabled: true },
  });
  if (!organizer || organizer.isDisabled) return null;
  return { id: organizer.id, username: organizer.username, name: organizer.name };
}
