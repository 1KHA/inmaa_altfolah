/**
 * Phase 4 e2e: broadcast — users picker endpoint, channel combinations,
 * audience resolution, counts, history, auth.
 */
const path = require('path');
const REPO = '/Users/kha/Documents/Code/dyam_hackathon/dhwmk_alvira';
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const MAILPIT = process.env.MAILPIT_URL || 'http://localhost:8025';
const SECRET = process.env.JWT_SECRET;
const TAG = `p4${Date.now()}`;

let pass = 0, fail = 0;
const made = { participants: [], mentors: [] };

function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  -> ' + detail : ''}`); }
}
const section = (s) => console.log(`\n--- ${s} ---`);

async function api(p, { cookie, method = 'GET', body } = {}) {
  const res = await fetch(BASE + p, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
const mp = async (p) => (await fetch(MAILPIT + p)).json();
const clearMp = async () => { await fetch(MAILPIT + '/api/v1/messages', { method: 'DELETE' }); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));


// Broadcast counts are stamped by the background queue drainer, not in the
// POST response (email-queue design, commit d65697b). Poll the row instead.
async function broadcastRowDone(id, timeoutMs = 8000) {
  const t0 = Date.now();
  for (;;) {
    const row = await prisma.broadcast.findUnique({ where: { id } });
    if (row && row.status !== 'queued' && row.status !== 'sending') return row;
    if (Date.now() - t0 > timeoutMs) return row;
    await wait(250);
  }
}

async function main() {
  const admin = await prisma.admin.findFirst({ select: { id: true, username: true } });
  const admins = await prisma.admin.findMany({ select: { id: true } });
  const aCookie = 'token=' + jwt.sign({ id: admin.id, username: admin.username, role: 'admin' }, SECRET, { expiresIn: '30m' });

  const settingsRow = await prisma.emailSettings.findFirst();
  await prisma.emailSettings.update({
    where: { id: settingsRow.id },
    data: {
      host: 'localhost', port: Number(process.env.MAILPIT_SMTP_PORT || 1025), secure: false, username: '', password: '',
      fromEmail: 'noreply@example.test', fromName: 'منصة دِيَم',
      adminInboxEmail: 'admins@example.test', enabled: true,
    },
  });
  await clearMp();

  // fixtures: 3 participants (one with a team) + 2 mentors
  const team = await prisma.team.create({ data: { teamName: `${TAG} فريق`, status: 'approved', isTeamRegistration: true } });
  const p1 = await prisma.participant.create({ data: { email: `${TAG}-p1@t.test`, fullName: 'مشارك ١', teamId: team.id } });
  const p2 = await prisma.participant.create({ data: { email: `${TAG}-p2@t.test`, fullName: 'مشارك ٢' , status: 'approved' } });
  const p3 = await prisma.participant.create({ data: { email: `${TAG}-p3@t.test`, fullName: 'مشارك ٣' , status: 'approved' } });
  made.participants.push(p1.id, p2.id, p3.id);
  made.teamId = team.id;
  const mt1 = await prisma.mentor.create({ data: { name: `${TAG} مرشد ١`, email: `${TAG}-mt1@t.test`, specialty: 'س', phone: '05', status: 'active' } });
  const mt2 = await prisma.mentor.create({ data: { name: `${TAG} مرشد ٢`, email: `${TAG}-mt2@t.test`, specialty: 'س', phone: '05', status: 'active' } });
  made.mentors.push(mt1.id, mt2.id);

  section('users picker endpoint');
  check('unauthenticated -> 401', (await api('/api/admin/users')).status === 401);
  const users = await api('/api/admin/users', { cookie: aCookie });
  check('returns participants AND mentors (team members included)',
    users.status === 200 &&
    users.json.users.some(u => u.id === p1.id && u.type === 'participant' && u.hasTeam) &&
    users.json.users.some(u => u.id === p2.id) &&
    users.json.users.some(u => u.id === mt1.id && u.type === 'mentor'),
    `count=${users.json?.users?.length}`);
  check('  no passwordHash leaked',
    users.json.users.every(u => !('passwordHash' in u)));

  section('dashboard-only broadcast to all participants');
  const b1 = await api('/api/admin/broadcast', {
    method: 'POST', cookie: aCookie,
    body: { title: `${TAG} إعلان`, body: 'نص الإعلان', channels: ['dashboard'], audience: { type: 'all-participants' } },
  });
  check('broadcast succeeds', b1.status === 200 && b1.json.success, `status=${b1.status} ${JSON.stringify(b1.json)}`);
  check('  notificationCount = 3', b1.json.broadcast.notificationCount === 3, String(b1.json.broadcast?.notificationCount));
  await wait(400);
  check('  zero emails (dashboard-only)', (await mp('/api/v1/messages')).total === 0);
  const dashRows = await prisma.notification.findMany({ where: { relatedEntityId: b1.json.broadcast.id } });
  check('  3 dashboard rows, emailStatus null',
    dashRows.length === 3 && dashRows.every(r => r.emailStatus === null && r.relatedEntityType === 'broadcast'));

  section('email-only broadcast to 2 selected users');
  await clearMp();
  const b2 = await api('/api/admin/broadcast', {
    method: 'POST', cookie: aCookie,
    body: {
      title: `${TAG} بريد فقط`, body: 'رسالة خاصة', emailSubject: `${TAG} موضوع مخصص`,
      channels: ['email'],
      audience: { type: 'selected', selected: [{ type: 'participant', id: p2.id }, { type: 'mentor', id: mt1.id }] },
    },
  });
  check('broadcast succeeds', b2.status === 200 && b2.json.success, JSON.stringify(b2.json));
  await wait(600);
  const inbox2 = await mp('/api/v1/messages?limit=50');
  const addressed = new Set();
  for (const m of inbox2.messages || []) {
    [...(m.To || []), ...(m.Bcc || [])].forEach(t => addressed.add(t.Address));
  }
  check('exactly the 2 selected users emailed',
    addressed.has(`${TAG}-p2@t.test`) && addressed.has(`${TAG}-mt1@t.test`) &&
    !addressed.has(`${TAG}-p1@t.test`) && !addressed.has(`${TAG}-mt2@t.test`),
    Array.from(addressed).join(','));
  check('  custom email subject used', (inbox2.messages || []).every(m => m.Subject === `${TAG} موضوع مخصص`),
    inbox2.messages?.[0]?.Subject);
  const b2Row = await broadcastRowDone(b2.json.broadcast.id);
  check('  emailSentCount = 2 (stamped by the queue drainer)', b2Row?.emailSentCount === 2, String(b2Row?.emailSentCount));
  check('  NO dashboard rows (email-only)',
    (await prisma.notification.count({ where: { relatedEntityId: b2.json.broadcast.id } })) === 0);
  const b2Logs = await prisma.emailLog.findMany({ where: { broadcastId: b2.json.broadcast.id } });
  check('  EmailLog: one row per SMTP message (BCC batch of 2), carries broadcastId',
    b2Logs.length === 1 && b2Logs[0].recipientCount === 2 && b2Logs[0].status === 'sent',
    JSON.stringify(b2Logs.map(l => ({ n: l.recipientCount, s: l.status }))));

  section('both channels to all mentors');
  await clearMp();
  const b3 = await api('/api/admin/broadcast', {
    method: 'POST', cookie: aCookie,
    body: { title: `${TAG} للمرشدين`, body: 'نص', channels: ['dashboard', 'email'], audience: { type: 'all-mentors' } },
  });
  check('broadcast succeeds', b3.status === 200 && b3.json.success);
  await wait(600);
  check('  2 mentor dashboard rows stamped sent',
    (await prisma.notification.count({ where: { relatedEntityId: b3.json.broadcast.id, emailStatus: 'sent' } })) === 2);
  const b3Row = await broadcastRowDone(b3.json.broadcast.id);
  check('  counts: notif=2 sent=2 failed=0 (from the drained row)',
    b3Row?.notificationCount === 2 && b3Row?.emailSentCount === 2 && b3Row?.emailFailedCount === 0,
    JSON.stringify({ n: b3Row?.notificationCount, s: b3Row?.emailSentCount, f: b3Row?.emailFailedCount }));

  section('broadcast to all admins -> shared inbox');
  await clearMp();
  const b4 = await api('/api/admin/broadcast', {
    method: 'POST', cookie: aCookie,
    body: { title: `${TAG} للمشرفين`, body: 'نص', channels: ['dashboard', 'email'], audience: { type: 'all-admins' } },
  });
  check('broadcast succeeds', b4.status === 200 && b4.json.success);
  await wait(600);
  const adminInbox = await mp('/api/v1/messages?limit=10');
  const b4Addressed = adminInbox.total === 1
    ? [...(adminInbox.messages[0].To || []), ...(adminInbox.messages[0].Bcc || [])].map(t => t.Address)
    : [];
  check('ONE email to shared inbox for all admins', adminInbox.total === 1 &&
    b4Addressed.includes('admins@example.test'),
    `total=${adminInbox.total} to=${b4Addressed.join(',')}`);
  check(`  ${admins.length} admin dashboard rows stamped sent`,
    (await prisma.notification.count({ where: { relatedEntityId: b4.json.broadcast.id, recipientType: 'admin', emailStatus: 'sent' } })) === admins.length);

  section('validation + auth + history');
  check('no channels -> 400', (await api('/api/admin/broadcast', { method: 'POST', cookie: aCookie, body: { title: 'ت', body: 'ن', channels: [], audience: { type: 'all-mentors' } } })).status === 400);
  check('empty selected -> 400', (await api('/api/admin/broadcast', { method: 'POST', cookie: aCookie, body: { title: 'ت', body: 'ن', channels: ['dashboard'], audience: { type: 'selected', selected: [] } } })).status === 400);
  check('missing title -> 400', (await api('/api/admin/broadcast', { method: 'POST', cookie: aCookie, body: { title: '', body: 'ن', channels: ['dashboard'], audience: { type: 'all-mentors' } } })).status === 400);
  check('unauthenticated POST -> 401', (await api('/api/admin/broadcast', { method: 'POST', body: {} })).status === 401);
  check('participant token -> 401', (await api('/api/admin/broadcast', {
    method: 'POST', body: {},
    cookie: 'token=' + jwt.sign({ id: p1.id, participantId: p1.id, role: 'participant' }, SECRET, { expiresIn: '10m' }),
  })).status === 401);

  const history = await api('/api/admin/broadcast', { cookie: aCookie });
  check('history returns the 4 broadcasts, newest first',
    history.status === 200 && history.json.broadcasts.length === 4 &&
    history.json.broadcasts[0].title === `${TAG} للمشرفين`,
    `count=${history.json?.broadcasts?.length}`);
  check('  createdBy = the sending admin', history.json.broadcasts.every(b => b.createdBy === admin.id));
}

main()
  .catch((e) => { fail++; console.error('\nSCRIPT ERROR:', e.stack); })
  .finally(async () => {
    section('cleanup');
    const settingsRow = await prisma.emailSettings.findFirst();
    await prisma.emailSettings.update({
      where: { id: settingsRow.id },
      data: { host: '', port: 587, secure: false, username: '', password: '', fromEmail: '', fromName: '', adminInboxEmail: '', enabled: false },
    });
    await prisma.emailLog.deleteMany({});
    await prisma.notification.deleteMany({});
    await prisma.broadcast.deleteMany({});
    await prisma.participant.deleteMany({ where: { id: { in: made.participants } } });
    await prisma.mentor.deleteMany({ where: { id: { in: made.mentors } } });
    if (made.teamId) await prisma.team.deleteMany({ where: { id: made.teamId } });
    await fetch(MAILPIT + '/api/v1/messages', { method: 'DELETE' });
    console.log(`  DB after cleanup — participants: ${await prisma.participant.count()}, broadcasts: ${await prisma.broadcast.count()}`);
    console.log(`\n${pass} passed, ${fail} failed`);
    await prisma.$disconnect();
    process.exit(fail === 0 ? 0 : 1);
  });
