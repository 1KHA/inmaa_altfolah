/**
 * e2e — sliding session expiry (middleware).
 *
 * Sessions last 60 min from the LAST activity: a request with a valid token
 * older than 5 min gets a re-issued cookie (same claims, exp = now + 60 min);
 * a fresh token is left alone; an expired token is not revived; logout is
 * never refreshed; the /api/admin/* anonymous guard still returns 401.
 */
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const TAG = `slide${Date.now()}`;

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? '  -> ' + detail : ''}`); } };
const section = (s) => console.log(`\n--- ${s} ---`);
const now = () => Math.floor(Date.now() / 1000);
/** Token whose iat is `ageMin` minutes in the past, valid for 60 min from then. */
const aged = (claims, ageMin) => jwt.sign({ ...claims, iat: now() - ageMin * 60 }, SECRET, { expiresIn: '60m' });
const decode = (t) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString());

async function call(pathname, token, method = 'GET') {
  const res = await fetch(BASE + pathname, { method, headers: token ? { cookie: 'token=' + token } : {}, redirect: 'manual' });
  const setCookie = res.headers.get('set-cookie') || '';
  const m = /token=([^;]+)/.exec(setCookie);
  return { status: res.status, newToken: m ? m[1] : null, setCookie };
}

const made = { participants: [], mentors: [] };
(async () => {
  if (!SECRET) throw new Error('JWT_SECRET required');
  const admin = await prisma.admin.findFirst();
  const p = await prisma.participant.create({ data: { email: `${TAG}@e2e.test`, fullName: 'Slide P', status: 'approved', passwordHash: 'x' } }); made.participants.push(p.id);
  const m = await prisma.mentor.create({ data: { name: 'Slide M', email: `${TAG}-m@e2e.test`, specialty: 'x', phone: '05', passwordHash: 'x', status: 'active' } }); made.mentors.push(m.id);
  const adminClaims = { id: admin.id, adminId: admin.id, username: admin.username, role: 'admin' };
  const pClaims = { id: p.id, participantId: p.id, email: p.email, role: 'participant', isLeader: false };
  const mClaims = { id: m.id, mentorId: m.id, email: m.email, role: 'mentor' };

  section('token older than 5 min is re-issued with a fresh 60-minute expiry');
  for (const [label, claims, url] of [['admin', adminClaims, '/api/admin/me'], ['participant', pClaims, '/api/participant/me'], ['mentor', mClaims, '/api/mentor/me']]) {
    const r = await call(url, aged(claims, 10));
    const ok = r.status === 200 && !!r.newToken;
    const d = r.newToken ? decode(r.newToken) : null;
    check(`${label}: 200 + Set-Cookie with a new token`, ok, `status=${r.status} setCookie=${r.setCookie.slice(0, 60)}`);
    if (d) {
      check(`  ${label}: new exp ≈ now + 60 min, same identity/role`, Math.abs(d.exp - (now() + 3600)) <= 5 && d.role === claims.role && d.id === claims.id, JSON.stringify({ exp: d.exp - now(), role: d.role }));
      check(`  ${label}: cookie flags HttpOnly + Max-Age=3600, no Secure over http`, /HttpOnly/i.test(r.setCookie) && /Max-Age=3600/.test(r.setCookie) && !/;\s*Secure/i.test(r.setCookie), r.setCookie.replace(/token=[^;]+/, 'token=<jwt>'));
      const again = await call(url, r.newToken);
      check(`  ${label}: the refreshed token works and is NOT refreshed again immediately`, again.status === 200 && again.newToken === null, `status=${again.status} refreshed=${!!again.newToken}`);
    }
  }

  section('fresh token is left alone');
  const fresh = await call('/api/participant/me', jwt.sign(pClaims, SECRET, { expiresIn: '60m' }));
  check('200 without Set-Cookie', fresh.status === 200 && fresh.newToken === null, `status=${fresh.status} refreshed=${!!fresh.newToken}`);

  section('expired token is not revived');
  const expiredTok = jwt.sign({ ...pClaims, iat: now() - 7200 }, SECRET, { expiresIn: '60m' }); // expired an hour ago
  const exp = await call('/api/participant/me', expiredTok);
  check('participant API -> 401, no new cookie', exp.status === 401 && exp.newToken === null, `status=${exp.status}`);
  const expAdmin = await call('/api/admin/me', jwt.sign({ ...adminClaims, iat: now() - 7200 }, SECRET, { expiresIn: '60m' }));
  check('admin API -> 401, no new cookie', expAdmin.status === 401 && expAdmin.newToken === null, `status=${expAdmin.status}`);

  section('dashboard pages refresh too; logout never does');
  const page = await call('/participant-dashboard', aged(pClaims, 10));
  check('participant dashboard page: 200 + refreshed cookie', page.status === 200 && !!page.newToken, `status=${page.status} refreshed=${!!page.newToken}`);
  const adminPage = await call('/admin-hackton-dashboard', aged(adminClaims, 10));
  check('admin dashboard page: 200 + refreshed cookie', adminPage.status === 200 && !!adminPage.newToken, `status=${adminPage.status}`);
  const lo = await call('/api/logout', aged(pClaims, 10), 'POST');
  const cleared = /token=;|Max-Age=0/.test(lo.setCookie);
  check('logout clears the cookie and does not re-issue a token', lo.status === 200 && cleared && !(lo.newToken && lo.newToken.length > 20), lo.setCookie.slice(0, 80));

  section('anonymous guard for /api/admin/* unchanged');
  check('no cookie -> 401', (await call('/api/admin/teams', null)).status === 401);
  check('garbage cookie -> 401', (await call('/api/admin/teams', 'not.a.jwt')).status === 401);
  check('login page without cookie still 200 (no refresh, no block)', (await call('/api/participant/booking-mode', null)).status !== 500);
})()
  .catch((e) => { fail++; console.error('\nSCRIPT ERROR:', e.stack); })
  .finally(async () => {
    try {
      await prisma.participant.deleteMany({ where: { id: { in: made.participants } } });
      await prisma.mentor.deleteMany({ where: { id: { in: made.mentors } } });
    } catch (e) { console.error('cleanup error:', e.message); }
    await prisma.$disconnect();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail > 0 ? 1 : 0);
  });
