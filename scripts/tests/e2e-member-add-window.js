/**
 * E2E suite for the admin-controlled member-add window (2026-09):
 *
 *  - team leaders can add members through /api/participant/add-member only
 *    inside the TeamSettings window the admin configures
 *  - after the deadline the leader gets the Arabic "no longer allowed" error
 *  - before the start date a matching "not started yet" error
 *  - the 30-member team cap is enforced server-side
 *  - /api/admin/team-settings GET/PUT auth + validation
 *  - /api/participant/member-add-window reflects the window
 *
 * IMPORTANT: TeamSettings is a shared singleton row — this suite always
 * restores it to NULL/NULL in `finally` so other suites see an open window.
 */
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const TAG = `e2ewin${Date.now()}`;

let pass = 0, fail = 0;
const made = { participants: [], teams: [] };

function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  -> ' + detail : ''}`); }
}
const section = (s) => console.log(`\n--- ${s} ---`);
const cookie = (c) => 'token=' + jwt.sign(c, SECRET, { expiresIn: '30m' });

async function api(pathname, { cookie: ck, method = 'GET', body } = {}) {
  const res = await fetch(BASE + pathname, {
    method,
    headers: { ...(ck ? { cookie: ck } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

const MAILPIT = 'http://localhost:8025';
const mp = async (p) => (await fetch(MAILPIT + p)).json();
const clearMp = async () => { await fetch(MAILPIT + '/api/v1/messages', { method: 'DELETE' }); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function inboxFor(addr) {
  const data = await mp('/api/v1/messages?limit=200');
  return (data.messages || []).filter(
    (m) =>
      (m.To || []).some((t) => t.Address === addr) ||
      (m.Bcc || []).some((t) => t.Address === addr)
  );
}

let seq = 0;
const memberBody = () => ({
  firstName: 'عضو', secondName: 'جديد', familyName: `${TAG}`, nationalId: `10${Date.now()}${seq}`,
  dob: '2000-01-01', email: `${TAG}-new${seq++}@t.test`, phoneNumber: '0500000000',
  education: 'بكالوريوس', university: 'جامعة', major: 'حاسب', employmentStatus: 'طالب',
  nationality: 'سعودي', residence: 'الرياض', canAttend: true,
});

async function main() {
  const admin = (await prisma.admin.findMany())[0];
  if (!admin) { check('an admin row exists (seed the DB first)', false); return; }
  const aCookie = cookie({ id: admin.id, username: admin.username, role: 'admin' });

  const team = await prisma.team.create({ data: { teamName: `${TAG} فريق`, status: 'approved' } });
  made.teams.push(team.id);
  const leader = await prisma.participant.create({
    data: { fullName: `${TAG} قائد`, email: `${TAG}-leader@t.test`, status: 'approved', teamId: team.id, isLeader: true },
  });
  made.participants.push(leader.id);
  const lCookie = cookie({ id: leader.id, participantId: leader.id, role: 'participant', teamId: team.id, isLeader: true });
  const memberCookie = () => cookie({ id: leader.id, participantId: leader.id, role: 'participant', teamId: team.id, isLeader: false });

  const setWindow = (start, end) =>
    api('/api/admin/team-settings', { method: 'PUT', cookie: aCookie, body: { memberAddStart: start, memberAddEnd: end } });

  // ============ settings API ============
  section('admin team-settings API');
  const g = await api('/api/admin/team-settings', { cookie: aCookie });
  check('GET returns 200 with maxMembers=30', g.status === 200 && g.json?.maxMembers === 30, JSON.stringify(g.json));
  check('GET without admin -> 401/403', [401, 403].includes((await api('/api/admin/team-settings', { cookie: lCookie })).status));
  const badPut = await setWindow(new Date(Date.now() + 864e5).toISOString(), new Date(Date.now() + 1000).toISOString());
  check('PUT with end <= start -> 400', badPut.status === 400, `status=${badPut.status}`);
  const badDate = await api('/api/admin/team-settings', { method: 'PUT', cookie: aCookie, body: { memberAddEnd: 'not-a-date' } });
  check('PUT with invalid date -> 400', badDate.status === 400, `status=${badDate.status}`);

  // ============ open window (unset) ============
  section('window unset -> adding allowed');
  await setWindow(null, null);
  const w1 = await api('/api/participant/member-add-window', { cookie: lCookie });
  check('member-add-window reports allowed', w1.status === 200 && w1.json?.allowed === true, JSON.stringify(w1.json));
  const add1 = await api('/api/participant/add-member', { method: 'POST', cookie: lCookie, body: memberBody() });
  check('leader can add a member', add1.status === 201, `status=${add1.status} ${JSON.stringify(add1.json)}`);
  if (add1.json?.id) made.participants.push(add1.json.id);

  // ============ closed: deadline passed ============
  section('deadline passed -> blocked with the "no longer allowed" error');
  await setWindow(null, new Date(Date.now() - 3600e3).toISOString());
  const w2 = await api('/api/participant/member-add-window', { cookie: lCookie });
  check('member-add-window reports closed', w2.json?.allowed === false && w2.json?.reason === 'closed', JSON.stringify(w2.json));
  const add2 = await api('/api/participant/add-member', { method: 'POST', cookie: lCookie, body: memberBody() });
  check('add after deadline -> 403', add2.status === 403, `status=${add2.status}`);
  check('  Arabic message says adding is no longer allowed',
    !!add2.json?.error && add2.json.error.includes('انتهى الوقت المسموح'), JSON.stringify(add2.json));

  // ============ closed: not started yet ============
  section('window not started yet');
  await setWindow(new Date(Date.now() + 864e5).toISOString(), new Date(Date.now() + 2 * 864e5).toISOString());
  const add3 = await api('/api/participant/add-member', { method: 'POST', cookie: lCookie, body: memberBody() });
  check('add before start -> 403 with "not started" message',
    add3.status === 403 && !!add3.json?.error && add3.json.error.includes('لم يبدأ'), `status=${add3.status} ${JSON.stringify(add3.json)}`);

  // ============ open window with future deadline ============
  section('open window -> allowed again');
  await setWindow(new Date(Date.now() - 3600e3).toISOString(), new Date(Date.now() + 864e5).toISOString());
  const add4 = await api('/api/participant/add-member', { method: 'POST', cookie: lCookie, body: memberBody() });
  check('add inside the window succeeds', add4.status === 201, `status=${add4.status} ${JSON.stringify(add4.json)}`);
  if (add4.json?.id) made.participants.push(add4.json.id);
  check('  response does not leak passwordHash', !('passwordHash' in (add4.json || {})));
  const added4 = await prisma.participant.findUnique({ where: { id: add4.json.id } });
  check('  new member has a stored passwordHash', !!added4?.passwordHash);
  check('  new member is auto-approved', added4?.status === 'approved', added4?.status);
  const welcome = await prisma.notification.findFirst({
    where: { recipientType: 'participant', recipientId: add4.json.id },
  });
  check('  dashboard notification created for the new member',
    !!welcome && welcome.title === 'تمت إضافتك إلى الفريق!', welcome?.title);

  // ============ credentials email -> member can actually log in ============
  section('credentials email through Mailpit + real login');
  const settingsRow = await prisma.emailSettings.findFirst();
  const originalSettings = settingsRow ? { ...settingsRow } : null;
  await prisma.emailSettings.update({
    where: { id: settingsRow.id },
    data: {
      host: 'localhost', port: 1025, secure: false, username: '', password: '',
      fromEmail: 'noreply@example.test', fromName: 'منصة دِيَم',
      adminInboxEmail: '', enabled: true,
    },
  });
  await clearMp();

  const mailAdd = await api('/api/participant/add-member', { method: 'POST', cookie: lCookie, body: memberBody() });
  check('add with email enabled succeeds', mailAdd.status === 201, `status=${mailAdd.status} ${JSON.stringify(mailAdd.json)}`);
  if (mailAdd.json?.id) made.participants.push(mailAdd.json.id);
  await wait(900);

  const newEmail = mailAdd.json?.email;
  const inbox = await inboxFor(newEmail);
  check('new member received exactly one email', inbox.length === 1, `count=${inbox.length}`);
  check('  subject carries the credentials wording',
    !!inbox[0] && inbox[0].Subject.includes('بيانات الدخول'), inbox[0]?.Subject);

  let mailedPassword = null;
  if (inbox[0]) {
    const full = await mp(`/api/v1/message/${inbox[0].ID}`);
    const text = (full.Text || '') + (full.HTML || '');
    mailedPassword = (/كلمة المرور:\s*([A-Za-z0-9]{10})/.exec(text) || [])[1] || null;
    check('  email contains the member email + a 10-char password',
      text.includes(newEmail) && !!mailedPassword, `password=${mailedPassword}`);
  } else {
    check('  email contains the member email + a 10-char password', false, 'no mail');
  }

  const loginRes = await api('/api/login', {
    method: 'POST', body: { email: newEmail, password: mailedPassword || 'x' },
  });
  check('member logs in with the mailed password', loginRes.status === 200 && loginRes.json?.user?.role === 'participant',
    `status=${loginRes.status} ${JSON.stringify(loginRes.json).slice(0, 100)}`);

  // restore email settings before the remaining sections
  if (originalSettings) {
    const { id, updatedAt, ...restore } = originalSettings;
    await prisma.emailSettings.update({ where: { id: settingsRow.id }, data: restore });
  }

  // ============ 30-member cap ============
  section('30-member cap');
  const current = await prisma.participant.count({ where: { teamId: team.id } });
  const fillers = [];
  for (let i = current; i < 30; i++) {
    fillers.push({ fullName: `${TAG} حشو ${i}`, email: `${TAG}-fill${i}@t.test`, status: 'approved', teamId: team.id });
  }
  if (fillers.length) await prisma.participant.createMany({ data: fillers });
  const fillerRows = await prisma.participant.findMany({ where: { teamId: team.id }, select: { id: true } });
  fillerRows.forEach((r) => { if (!made.participants.includes(r.id)) made.participants.push(r.id); });

  const add5 = await api('/api/participant/add-member', { method: 'POST', cookie: lCookie, body: memberBody() });
  check('31st member is refused (400) with cap message',
    add5.status === 400 && !!add5.json?.error && add5.json.error.includes('30'), `status=${add5.status} ${JSON.stringify(add5.json)}`);

  // ============ guard rails ============
  section('guard rails');
  const nonLeader = await api('/api/participant/add-member', { method: 'POST', cookie: memberCookie(), body: memberBody() });
  check('non-leader still refused (403)', nonLeader.status === 403, `status=${nonLeader.status}`);
  check('unauthenticated window read -> 401', (await api('/api/participant/member-add-window')).status === 401);
}

main()
  .catch((e) => { fail++; console.error('SUITE ERROR:', e); })
  .finally(async () => {
    try {
      // restore the shared singleton so other suites see an open window
      await prisma.teamSettings.updateMany({ data: { memberAddStart: null, memberAddEnd: null } });
      // the credentials-email section writes an EmailLog row and a Mailpit
      // message — remove both (phase2 asserts a clean EmailLog table)
      await prisma.emailLog.deleteMany({ where: { templateKey: 'memberAddedByLeader' } });
      await clearMp().catch(() => {});
      await prisma.participant.deleteMany({ where: { OR: [{ id: { in: made.participants } }, { email: { startsWith: TAG } }] } });
      await prisma.team.deleteMany({ where: { id: { in: made.teams } } });
    } catch (e) {
      console.error('cleanup error:', e.message);
    }
    await prisma.$disconnect();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail > 0 ? 1 : 0);
  });
