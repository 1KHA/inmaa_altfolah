import type { NextRequest } from 'next/server';

/**
 * Whether the auth cookie should carry the `Secure` flag for this request.
 *
 * `secure: NODE_ENV === 'production'` broke the Docker stack when reached over
 * plain HTTP from another machine (http://192.168.x.x:3011): the production
 * build set `Secure`, the browser silently dropped the cookie, and every login
 * bounced back to the login page (localhost is exempt from that rule, which is
 * why it only showed up over the LAN).
 *
 * So decide from the request itself: HTTPS (directly, or via the proxy's
 * x-forwarded-proto — Vercel always sets it to https) → Secure; plain HTTP →
 * not Secure. `AUTH_COOKIE_SECURE=true|false` overrides when needed.
 */
export function isSecureRequest(request: NextRequest): boolean {
  const override = process.env.AUTH_COOKIE_SECURE;
  if (override === 'true') return true;
  if (override === 'false') return false;

  const forwarded = request.headers.get('x-forwarded-proto');
  if (forwarded) return forwarded.split(',')[0].trim().toLowerCase() === 'https';
  return request.nextUrl.protocol === 'https:';
}
