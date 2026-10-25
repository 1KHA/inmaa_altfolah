import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export type RecipientType = 'admin' | 'participant' | 'mentor' | 'advisor';

export interface Recipient {
  recipientType: RecipientType;
  recipientId: string;
}

/**
 * Claims that may appear on a token issued by any of the login routes.
 *
 * The three routes do not agree on shape: participant and mentor tokens carry
 * both `id` and a legacy `<type>Id` alias, while the admin token carries only
 * `id` + `role`. Every field is therefore optional and callers must go through
 * `resolveRecipient` rather than reading a claim directly.
 */
export interface TokenClaims {
  id?: string;
  role?: string;
  adminId?: string;
  participantId?: string;
  mentorId?: string;
  advisorId?: string;
}

/**
 * Verify a JWT and return its claims, or null if the token is missing/invalid.
 */
export function verifyToken(token: string | undefined): TokenClaims | null {
  if (!token) return null;

  try {
    return jwt.verify(token, JWT_SECRET) as TokenClaims;
  } catch {
    return null;
  }
}

/**
 * Map token claims onto the (recipientType, recipientId) pair that the
 * Notification table is keyed by.
 *
 * `role` is checked first and the legacy `<type>Id` alias second, because the
 * admin login route (src/app/api/admin/login/route.ts) signs only
 * `{ id, username, role: 'admin' }` — it has no `adminId` claim. Resolving on
 * the alias alone is what made every admin request to /api/notifications fail.
 *
 * Returns null when the token belongs to none of the known user types.
 */
export function resolveRecipient(claims: TokenClaims | null): Recipient | null {
  if (!claims) return null;

  if (claims.role === 'admin' || claims.adminId) {
    const recipientId = claims.adminId || claims.id;
    return recipientId ? { recipientType: 'admin', recipientId } : null;
  }

  if (claims.role === 'participant' || claims.participantId) {
    const recipientId = claims.participantId || claims.id;
    return recipientId ? { recipientType: 'participant', recipientId } : null;
  }

  if (claims.role === 'mentor' || claims.mentorId) {
    const recipientId = claims.mentorId || claims.id;
    return recipientId ? { recipientType: 'mentor', recipientId } : null;
  }

  if (claims.role === 'advisor' || claims.advisorId) {
    const recipientId = claims.advisorId || claims.id;
    return recipientId ? { recipientType: 'advisor', recipientId } : null;
  }

  return null;
}

/**
 * Convenience wrapper: verify a token and resolve it to a recipient in one step.
 */
export function resolveRecipientFromToken(token: string | undefined): Recipient | null {
  return resolveRecipient(verifyToken(token));
}

/**
 * Admin gate for API routes: returns the admin's id, or null when the token is
 * missing, invalid, or not an admin. The admin login route signs the id as
 * `id` (no `adminId` claim), hence the fallback chain.
 */
export function requireAdmin(token: string | undefined): string | null {
  const claims = verifyToken(token);
  if (!claims || claims.role !== 'admin') return null;
  return claims.adminId || claims.id || null;
}

/**
 * Advisor gate for API routes: returns the advisor's id, or null when the
 * token is missing, invalid, or not an advisor's. Whether the account is
 * disabled is checked separately (requireActiveAdvisor in account-status.ts).
 */
export function requireAdvisor(token: string | undefined): string | null {
  const claims = verifyToken(token);
  if (!claims || claims.role !== 'advisor') return null;
  return claims.advisorId || claims.id || null;
}
