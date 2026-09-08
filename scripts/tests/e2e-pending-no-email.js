/**
 * Pending / rejected accounts must not receive bulk email.
 *
 * Announcements (new milestone, new event) and the admin "all participants" /
 * "all mentors" broadcasts previously reached EVERY non-disabled participant,
 * including people who were never approved and people who had been rejected.
 *
 * The two cases that make this subtle, both asserted here:
 *   - `approve-team` never sets Participant.status, so an approved team's
 *     members are still `status: 'pending'` — they MUST still receive.
 *   - approval/rejection notices are dispatched AFTER the status changes, so
 *     they must still be delivered to the person concerned.
 */
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const TAG = `pnd${Date.now()}`;

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { if (ok) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? '  -> ' + d : ''}`); } };
const section = (s) => console.log(`\n--- ${s} ---`);
const cookie = (c) => 'token=' + jwt.sign(c, SECRET, { expiresIn: '30m' });
async function api(p, { cookie: ck, method = 'GET', body } = {}) {
  const res = await fetch(BASE + p, { method, headers: { ...(ck ? { cookie: ck } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
async function waitForServer() {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/api/admin/broadcast')).status === 401) return; } catch {} await new Promise(r => setTimeout(r, 2000)); }
  throw new Error('server not reachable');
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  if (!SECRET) throw new Error('JWT_SECRET required');
  await waitForServer();
  const admin = await prisma.admin.upsert({ where: { username: `${TAG}-adm` }, update: {}, create: { username: `${TAG}-adm`, passwordHash: 'x' } });
  const aCookie = cookie({ id: admin.id, username: admin.username, role: 'admin' });

  const settings = await prisma.emailSettings.findFirst();
  const saved = { ...settings }; delete saved.id; delete saved.updatedAt;
  await prisma.emailSettings.update({ where: { id: settings.id }, data: {
    enabled: true, host: '127.0.0.1', port: 2599, secure: false, username: '', password: '',
    fromEmail: `n@${TAG}.test`, fromName: 'T', adminInboxEmail: '' } });

  const mk = (name, data) => prisma.participant.create({ data: { email: `${TAG}-${name}@t.local`, fullName: name, ...data } });
  const pending   = await mk('pending',  { status: 'pending' });
  const approved  = await mk('approved', { status: 'approved' });
  const rejected  = await mk('rejected', { status: 'rejected' });
  const disabled  = await mk('disabled', { status: 'approved', isDisabled: true });

  // the subtle one: approved TEAM, members still status='pending'
  const okTeam = await prisma.team.create({ data: { teamName: `${TAG} فريق مقبول`, status: 'approved' } });
  const teamOk = await mk('teamok', { status: 'pending', teamId: okTeam.id, isLeader: true });
  // and a member of a still-pending team
  const pendTeam = await prisma.team.create({ data: { teamName: `${TAG} فريق معلق`, status: 'pending' } });
  const teamPend = await mk('teampend', { status: 'pending', teamId: pendTeam.id, isLeader: true });

  const mMk = (name, status) => prisma.mentor.create({ data: { name, email: `${TAG}-${name}@t.local`, specialty: 's', phone: '05', status } });
  const mActive  = await mMk('mactive', 'active');
  const mPending = await mMk('mpending', 'pending');
  const mInactive = await mMk('minactive', 'inactive');

  const reached = (notifs, p) => notifs.some((n) => n.recipientId === p.id);

  section('new MILESTONE announcement');
  // EmailLog subjects come from the shared template, so rows from other suites
  // are indistinguishable by content — scope the later assertion by time.
  const runStartedAt = new Date();
  let r = await api('/api/admin/milestones', { cookie: aCookie, method: 'POST', body: {
    title: `${TAG} مرحلة`, description: 'وصف', requirements: 'متطلبات',
    dueDate: new Date(Date.now() + 864e5).toISOString(), status: 'active' } });
  check('milestone created', r.status === 201, String(r.status));
  await sleep(1200);
  let n = await prisma.notification.findMany({ where: { relatedEntityType: 'milestone' }, select: { recipientId: true } });
  check('pending participant NOT notified', !reached(n, pending));
  check('rejected participant NOT notified', !reached(n, rejected));
  check('member of a PENDING team NOT notified', !reached(n, teamPend));
  check('disabled participant NOT notified', !reached(n, disabled));
  check('approved individual IS notified', reached(n, approved));
  check('member of an APPROVED team IS notified (own status still pending)', reached(n, teamOk),
        'this is the regression trap — approve-team never sets Participant.status');

  section('new EVENT announcement');
  r = await api('/api/admin/events', { cookie: aCookie, method: 'POST', body: {
    title: `${TAG} فعالية`, description: 'd', type: 'workshop',
    startDate: new Date(Date.now() + 864e5).toISOString(), endDate: new Date(Date.now() + 9e7).toISOString(),
    location: 'قاعة', capacity: 50, presenter: 'م', plan: 'خ' } });
  check('event created', r.status === 201, String(r.status));
  await sleep(1200);
  n = await prisma.notification.findMany({ where: { relatedEntityType: 'event' }, select: { recipientId: true } });
  check('pending NOT notified', !reached(n, pending));
  check('rejected NOT notified', !reached(n, rejected));
  check('approved IS notified', reached(n, approved));
  check('approved-team member IS notified', reached(n, teamOk));

  section('emails actually sent to the right count');
  const logs = await prisma.emailLog.findMany({
    where: {
      templateKey: { in: ['newMilestoneAvailable', 'newEventAvailable'] },
      createdAt: { gte: runStartedAt },
    },
    select: { templateKey: true, recipientCount: true },
  });
  check('each announcement emailed exactly the 2 eligible participants',
        logs.length > 0 && logs.every((l) => l.recipientCount === 2), JSON.stringify(logs));

  section('broadcast: all-participants');
  r = await api('/api/admin/broadcast', { cookie: aCookie, method: 'POST', body: {
    title: `${TAG} bc`, body: 'x', emailSubject: `${TAG} bc`, channels: ['email'], audience: { type: 'all-participants' } } });
  let emails = (await prisma.broadcastRecipient.findMany({ where: { broadcastId: r.json.broadcast.id }, select: { email: true } })).map((x) => x.email);
  check('pending / rejected / pending-team excluded',
        !emails.includes(pending.email) && !emails.includes(rejected.email) && !emails.includes(teamPend.email), JSON.stringify(emails));
  check('approved + approved-team member included',
        emails.includes(approved.email) && emails.includes(teamOk.email), JSON.stringify(emails));

  section('broadcast: all-mentors');
  r = await api('/api/admin/broadcast', { cookie: aCookie, method: 'POST', body: {
    title: `${TAG} bm`, body: 'x', emailSubject: `${TAG} bm`, channels: ['email'], audience: { type: 'all-mentors' } } });
  emails = (await prisma.broadcastRecipient.findMany({ where: { broadcastId: r.json.broadcast.id }, select: { email: true } })).map((x) => x.email);
  check('pending mentor excluded', !emails.includes(mPending.email), JSON.stringify(emails));
  check('inactive mentor excluded', !emails.includes(mInactive.email));
  check('active mentor included', emails.includes(mActive.email));

  section('approval / rejection notices STILL deliver (must not be filtered)');
  const before = await prisma.notification.count({ where: { recipientId: pending.id } });
  r = await api('/api/admin/reject-participant', { cookie: aCookie, method: 'POST', body: { participantId: pending.id } });
  await sleep(900);
  const afterReject = await prisma.notification.count({ where: { recipientId: pending.id } });
  check('a rejected participant still receives their rejection notice', afterReject > before,
        `${before} -> ${afterReject} (status is 'rejected' by dispatch time)`);

  const p2 = await mk('willapprove', { status: 'pending' });
  r = await api('/api/admin/approve-participant', { cookie: aCookie, method: 'POST', body: { participantId: p2.id } });
  await sleep(900);
  check('an approved participant receives their approval notice',
        (await prisma.notification.count({ where: { recipientId: p2.id } })) > 0, String(r.status));

  section('cleanup');
  await prisma.notification.deleteMany({ where: { recipient: undefined, OR: [{ relatedEntityType: 'milestone' }, { relatedEntityType: 'event' }] } });
  await prisma.broadcastRecipient.deleteMany({ where: { broadcast: { title: { startsWith: TAG } } } });
  await prisma.broadcast.deleteMany({ where: { title: { startsWith: TAG } } });
  // broadcast sends log with templateKey=null — catch them via the TAG subject
  await prisma.emailLog.deleteMany({ where: { subject: { startsWith: TAG } } });
  await prisma.emailLog.deleteMany({ where: { templateKey: { in: ['newMilestoneAvailable', 'newEventAvailable', 'participantApproval', 'participantRejection'] } } });
  await prisma.milestone.deleteMany({ where: { title: { startsWith: TAG } } });
  await prisma.event.deleteMany({ where: { title: { startsWith: TAG } } });
  await prisma.notification.deleteMany({ where: { recipientId: { in: [pending.id, approved.id, rejected.id, disabled.id, teamOk.id, teamPend.id, p2.id] } } });
  await prisma.participant.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.team.deleteMany({ where: { teamName: { startsWith: TAG } } });
  await prisma.mentor.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.admin.delete({ where: { id: admin.id } });
  await prisma.emailSettings.update({ where: { id: settings.id }, data: saved });
  console.log('  cleaned up');

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('CRASH', e); await prisma.$disconnect(); process.exit(1); });
