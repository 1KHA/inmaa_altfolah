import { NextRequest, NextResponse } from 'next/server';
// Import the minimal jwt submodules, not the package root — the root index
// also pulls in jose's JWE (encryption) code path, which references
// CompressionStream/DecompressionStream and is not Edge Runtime safe.
import { jwtVerify } from 'jose/jwt/verify';
import { SignJWT } from 'jose/jwt/sign';
import { isSecureRequest } from '@/lib/cookie-security';

/**
 * Two jobs, both on the Edge runtime (hence `jose`, not `jsonwebtoken`):
 *
 * 1. Safety net for /api/admin/*: rejects any request with no valid JWT at
 *    all before it reaches a route handler. Deliberately coarse — "some valid
 *    token exists", not "the caller is an admin" — because a few
 *    admin-prefixed routes are legitimately read by participants (mentors
 *    list, availability). The admin-vs-role distinction stays in each route's
 *    own requireAdmin()/verifyToken() check.
 *
 * 2. Sliding session for every role: sessions last SESSION_MINUTES from the
 *    LAST activity, not from login. On any dashboard/API request carrying a
 *    valid token that is older than REFRESH_AFTER_MINUTES, the same claims are
 *    re-signed with a fresh expiry and the cookie is re-issued. An idle user
 *    is still logged out after SESSION_MINUTES; an active one never is.
 *    Claims are copied as-is (no DB access here); routes that must not trust
 *    a stale claim (e.g. isLeader) already read the database.
 */

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
/** Must match the lifetime the login routes issue. */
export const SESSION_MINUTES = 60;
/** Don't rewrite the cookie on every request — only once the token has aged this much. */
const REFRESH_AFTER_MINUTES = 5;

// Public — no cookie exists yet at this point in the flow
const PUBLIC_ADMIN_PATHS = ['/api/admin/login'];
// Never refresh on the way out.
const NO_REFRESH_PATHS = ['/api/logout'];

const secretKey = () => new TextEncoder().encode(JWT_SECRET);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAdminApi = pathname.startsWith('/api/admin/');

  if (isAdminApi && PUBLIC_ADMIN_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get('token')?.value;

  if (!token) {
    return isAdminApi ? NextResponse.json({ error: 'غير مصرح' }, { status: 401 }) : NextResponse.next();
  }

  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(token, secretKey()));
  } catch {
    // Expired/invalid: admin APIs are refused here; everything else falls
    // through to the route's own auth check (which returns its usual 401).
    return isAdminApi ? NextResponse.json({ error: 'غير مصرح' }, { status: 401 }) : NextResponse.next();
  }

  const response = NextResponse.next();

  // ---- sliding expiry -----------------------------------------------------
  if (NO_REFRESH_PATHS.includes(pathname)) return response;
  const nowSec = Math.floor(Date.now() / 1000);
  const iat = typeof payload.iat === 'number' ? payload.iat : nowSec;
  if (nowSec - iat < REFRESH_AFTER_MINUTES * 60) return response;

  try {
    const { iat: _iat, exp: _exp, nbf: _nbf, ...claims } = payload;
    const fresh = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${SESSION_MINUTES}m`)
      .sign(secretKey());
    response.cookies.set('token', fresh, {
      httpOnly: true,
      secure: isSecureRequest(request),
      sameSite: 'lax',
      maxAge: SESSION_MINUTES * 60,
      path: '/',
    });
  } catch (error) {
    // Refresh is best-effort; the current token is still valid for this request.
    console.error('[middleware] session refresh failed:', error);
  }
  return response;
}

export const config = {
  matcher: [
    '/api/:path*',
    '/admin-hackton-dashboard/:path*',
    '/participant-dashboard/:path*',
    '/mentor-dashboard/:path*',
  ],
};
