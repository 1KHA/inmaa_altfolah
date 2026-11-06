/**
 * End-to-end suite for organizer (منظم) accounts.
 *
 * Covers organizer login, the session gate (role + disabled flag read from the
 * DB), the general check-in scanner, the read-only active-participant search,
 * that organizer tokens are refused by admin APIs (incl. undo), and that the
 * admin general scanner still behaves the same after sharing its logic.
 *
 * Needs a running app (VERIFY_BASE_URL), its DATABASE_URL and JWT_SECRET.
 * Run against the local Docker test DB — never production.
 */
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const bcrypt = require(path.join(REPO, 'node_modules/bcryptjs'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const TAG = `org${Date.now()}`;

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { if (ok) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? '  -> ' + d : ''}`); } };
const section = (s) => console.log(`\n--- ${s} ---`);
const sign = (c) => 'token=' + jwt.sign(c, SECRET, { expiresIn: '30m' });
const riyadhToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

async function api(p, { cookie, method = 'GET', body } = {}) {
  const res = await fetch(BASE + p, { method, headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json, setCookie: res.headers.get('set-cookie') || '' };
}

(async () => {
  if (!SECRET) throw new Error('JWT_SECRET required');
  const today = riyadhToday();
  const PASSWORD = 'Door-Pass-123';
  const hash = await bcrypt.hash(PASSWORD, 10);

  section('fixtures');
  const admin = await prisma.admin.create({ data: { username: `${TAG}-adm`, passwordHash: 'x' } });
  const adminCookie = sign({ id: admin.id, username: admin.username, role: 'admin' });
  const org = await prisma.organizer.create({ data: { username: `${TAG}-o1`, name: 'منظم اختبار', passwordHash: hash } });
  const orgOff = await prisma.organizer.create({ data: { username: `${TAG}-o2`, name: 'منظم معطّل', passwordHash: hash, isDisabled: true } });

  const team = await prisma.team.create({ data: { teamName: `${TAG} فريق النخيل`, status: 'approved' } });
  const offTeam = await prisma.team.create({ data: { teamName: `${TAG} فريق معطّل`, status: 'approved', isDisabled: true } });
  const mk = (k, data) => prisma.participant.create({ data: { email: `${TAG}-${k}@t.local`, badgeCode: `INMAA-${TAG.toUpperCase()}${k.toUpperCase()}`, ...data } });
  const lead = await mk('lead', { fullName: `سارة ${TAG} العتيبي`, teamId: team.id, isLeader: true, contactNumber: '0500000000', nationalId: '1111111111' });
  const split = await mk('split', { firstName: 'خالد', secondName: TAG, familyName: 'الحربي', teamId: team.id, status: 'pending' }); // member status pending is normal
  const offMember = await mk('off', { fullName: `معطّل ${TAG}`, teamId: offTeam.id });
  const pendingSolo = await mk('pend', { fullName: `منتظر ${TAG}`, status: 'pending' });
  const solo = await mk('solo', { fullName: `فرد ${TAG}`, status: 'approved' });
  check('fixtures created', Boolean(lead && split && offMember && pendingSolo && solo));

  section('login');
  let r = await api('/api/organizer/login', { method: 'POST', body: { username: org.username, password: 'wrong' } });
  check('wrong password -> 401', r.status === 401, String(r.status));
  r = await api('/api/organizer/login', { method: 'POST', body: { username: `${TAG}-nobody`, password: PASSWORD } });
  check('unknown username -> 401', r.status === 401, String(r.status));
  r = await api('/api/organizer/login', { method: 'POST', body: { username: '', password: '' } });
  check('empty -> 400', r.status === 400, String(r.status));
  r = await api('/api/organizer/login', { method: 'POST', body: { username: orgOff.username, password: PASSWORD } });
  check('disabled organizer -> 403', r.status === 403, String(r.status));
  r = await api('/api/organizer/login', { method: 'POST', body: { username: org.username, password: PASSWORD } });
  const tokenMatch = /token=([^;]+)/.exec(r.setCookie);
  check('valid login -> 200 + token cookie', r.status === 200 && Boolean(tokenMatch), String(r.status));
  const orgCookie = `token=${tokenMatch && tokenMatch[1]}`;
  const claims = tokenMatch ? jwt.decode(tokenMatch[1]) : {};
  check('token role is organizer', claims.role === 'organizer' && claims.id === org.id, JSON.stringify(claims));

  section('session gate');
  r = await api('/api/organizer/me', { cookie: orgCookie });
  check('me -> 200 with name + today', r.status === 200 && r.json.role === 'organizer' && r.json.name === org.name && r.json.today === today, JSON.stringify(r.json));
  r = await api('/api/organizer/me');
  check('me without cookie -> 401', r.status === 401, String(r.status));
  r = await api('/api/organizer/me', { cookie: adminCookie });
  check('admin token is not an organizer -> 401', r.status === 401, String(r.status));
  r = await api('/api/organizer/me', { cookie: sign({ id: lead.id, participantId: lead.id, role: 'participant' }) });
  check('participant token -> 401', r.status === 401, String(r.status));
  r = await api('/api/organizer/me', { cookie: sign({ id: orgOff.id, role: 'organizer' }) });
  check('signed token of a disabled organizer -> 401', r.status === 401, String(r.status));

  section('scanner (general check-in)');
  const scan = (cookie, badgeCode, extra = {}) => api('/api/organizer/scan', { cookie, method: 'POST', body: { badgeCode, method: 'scan', ...extra } });
  r = await scan(orgCookie, lead.badgeCode.toLowerCase());
  check('first scan -> checkedIn today (code case-insensitive)', r.status === 200 && r.json.result === 'checkedIn' && r.json.date === today && r.json.fullName === lead.fullName && r.json.teamName === team.teamName, JSON.stringify(r.json));
  r = await scan(orgCookie, lead.badgeCode);
  check('same day again -> alreadyCheckedIn', r.status === 200 && r.json.result === 'alreadyCheckedIn', JSON.stringify(r.json));
  r = await scan(orgCookie, lead.badgeCode, { date: '2099-01-01', mode: 'event', eventId: 'x' });
  check('client date / event mode are ignored -> still today, general', r.json && r.json.result === 'alreadyCheckedIn' && r.json.date === today, JSON.stringify(r.json));
  const rec = await prisma.attendanceRecord.findMany({ where: { participantId: lead.id } });
  check('one general record, scannedBy = organizer', rec.length === 1 && rec[0].eventId === null && rec[0].checkinDate === today && rec[0].scannedBy === org.id && rec[0].method === 'scan', JSON.stringify(rec));
  r = await scan(orgCookie, 'INMAA-DOESNOTEXIST');
  check('unknown badge -> 404', r.status === 404, String(r.status));
  r = await scan(orgCookie, '');
  check('empty code -> 400', r.status === 400, String(r.status));
  r = await scan(null, solo.badgeCode);
  check('no cookie -> 401', r.status === 401, String(r.status));
  r = await scan(adminCookie, solo.badgeCode);
  check('admin token on organizer scan -> 401', r.status === 401, String(r.status));
  r = await api('/api/organizer/scan', { cookie: orgCookie, method: 'POST', body: { badgeCode: solo.badgeCode, method: 'manual' } });
  check('manual entry recorded as manual', r.json && r.json.result === 'checkedIn' && (await prisma.attendanceRecord.findFirst({ where: { participantId: solo.id } })).method === 'manual', JSON.stringify(r.json));

  section('organizer cannot use admin APIs');
  r = await api('/api/admin/attendance/undo', { cookie: orgCookie, method: 'POST', body: { participantId: lead.id, mode: 'general', date: today } });
  check('undo -> 401', r.status === 401, String(r.status));
  check('…and the check-in is still there', (await prisma.attendanceRecord.count({ where: { participantId: lead.id } })) === 1);
  r = await api('/api/admin/attendance/scan', { cookie: orgCookie, method: 'POST', body: { badgeCode: split.badgeCode, mode: 'general' } });
  check('admin scan endpoint -> 401', r.status === 401, String(r.status));
  for (const p of ['/api/admin/attendance?mode=general', '/api/admin/me', '/api/admin/participants', '/api/admin/teams', '/api/admin/broadcast']) {
    r = await api(p, { cookie: orgCookie });
    check(`GET ${p} -> refused`, r.status === 401 || r.status === 403, String(r.status));
  }
  r = await api('/api/admin/broadcast', { cookie: orgCookie, method: 'POST', body: { title: 't', body: 'b', channels: ['dashboard'], audience: { type: 'all-participants' } } });
  check('POST broadcast -> 401', r.status === 401, String(r.status));

  section('search (read-only, active only)');
  const search = (q, cookie = orgCookie) => api(`/api/organizer/participants?q=${encodeURIComponent(q)}`, { cookie });
  r = await search('');
  check('empty query -> no results', r.status === 200 && r.json.results.length === 0, JSON.stringify(r.json));
  r = await search('س');
  check('1 character -> no results', r.status === 200 && r.json.results.length === 0);
  r = await search(TAG);
  const emails = (r.json?.results || []).map((x) => x.email.replace(`${TAG}-`, '').replace('@t.local', '')).sort().join(',');
  check('tag search = active people only (lead, split member, solo)', emails === 'lead,solo,split', emails);
  const leadRow = (r.json?.results || []).find((x) => x.participantId === lead.id);
  check('row shows today\'s check-in', leadRow && leadRow.checkedInToday === true && Boolean(leadRow.checkedInAt), JSON.stringify(leadRow));
  const splitRow = (r.json?.results || []).find((x) => x.participantId === split.id);
  check('split-name row gets a joined name, not checked in', splitRow && splitRow.name === `خالد ${TAG} الحربي` && splitRow.checkedInToday === false, JSON.stringify(splitRow));
  check('no badge code / phone / ID in results', leadRow && !('badgeCode' in leadRow) && !JSON.stringify(r.json).includes('INMAA-') && !JSON.stringify(r.json).includes('0500000000') && !JSON.stringify(r.json).includes('1111111111'));
  r = await search(`خالد ${TAG}`);
  check('multi-word name across split fields', (r.json?.results || []).length === 1 && r.json.results[0].participantId === split.id, JSON.stringify(r.json?.results));
  r = await search(`${TAG}-LEAD@T.LOCAL`);
  check('email search, case-insensitive', (r.json?.results || []).some((x) => x.participantId === lead.id), JSON.stringify(r.json?.results));
  r = await search(`${TAG} فريق النخيل`);
  check('team name search returns its active members', (r.json?.results || []).length === 2, JSON.stringify(r.json?.results));
  r = await search(`منتظر ${TAG}`);
  check('pending individual not shown', (r.json?.results || []).length === 0);
  r = await search(`معطّل ${TAG}`);
  check('member of a disabled team not shown', (r.json?.results || []).length === 0);
  r = await search(TAG, null);
  check('search without cookie -> 401', r.status === 401, String(r.status));
  r = await search(TAG, adminCookie);
  check('search with admin token -> 401', r.status === 401, String(r.status));

  section('admin general scanner unchanged');
  const adminScan = (badgeCode) => api('/api/admin/attendance/scan', { cookie: adminCookie, method: 'POST', body: { badgeCode, mode: 'general', method: 'scan' } });
  r = await adminScan(split.badgeCode);
  check('admin scan -> checkedIn with recordId, name, team, date', r.status === 200 && r.json.success && r.json.result === 'checkedIn' && r.json.recordId && r.json.fullName === `خالد ${TAG} الحربي` && r.json.teamName === team.teamName && r.json.date === today, JSON.stringify(r.json));
  r = await adminScan(split.badgeCode);
  check('admin repeat -> alreadyCheckedIn', r.status === 200 && r.json.result === 'alreadyCheckedIn' && r.json.date === today, JSON.stringify(r.json));
  r = await adminScan(lead.badgeCode);
  check('admin sees organizer check-in as already done', r.json && r.json.result === 'alreadyCheckedIn', JSON.stringify(r.json));
  r = await adminScan('INMAA-DOESNOTEXIST');
  check('admin unknown badge -> 404', r.status === 404, String(r.status));
  r = await api('/api/admin/attendance/undo', { cookie: adminCookie, method: 'POST', body: { participantId: split.id, mode: 'general', date: today } });
  check('admin can still undo', r.status === 200 && r.json.undone === true, JSON.stringify(r.json));

  section('disabling an organizer ends access immediately');
  await prisma.organizer.update({ where: { id: org.id }, data: { isDisabled: true } });
  r = await api('/api/organizer/me', { cookie: orgCookie });
  check('me -> 401 with the still-valid token', r.status === 401, String(r.status));
  r = await scan(orgCookie, split.badgeCode);
  check('scan -> 401', r.status === 401, String(r.status));
  r = await search(TAG);
  check('search -> 401', r.status === 401, String(r.status));

  section('pages');
  for (const p of ['/organizer-login', '/organizer-dashboard']) {
    r = await api(p);
    check(`${p} -> 200`, r.status === 200, String(r.status));
  }

  section('cleanup');
  const ids = [lead.id, split.id, offMember.id, pendingSolo.id, solo.id];
  await prisma.attendanceRecord.deleteMany({ where: { participantId: { in: ids } } });
  await prisma.notification.deleteMany({ where: { recipientId: { in: ids } } });
  await prisma.emailLog.deleteMany({ where: { toEmail: { startsWith: TAG } } });
  await prisma.participant.deleteMany({ where: { id: { in: ids } } });
  await prisma.team.deleteMany({ where: { id: { in: [team.id, offTeam.id] } } });
  await prisma.organizer.deleteMany({ where: { username: { startsWith: TAG } } });
  await prisma.admin.delete({ where: { id: admin.id } });
  console.log('  cleaned up');

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(2); });
