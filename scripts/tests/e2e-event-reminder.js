/**
 * End-to-end test for the admin "إرسال تذكير" (send event reminder) action.
 *
 * The button used to be a dead UI stub with no onClick. It now calls
 * POST /api/admin/events/[eventId]/remind, which sends BOTH a dashboard
 * notification and an email to everyone still registered for the event.
 *
 * Verifies: the GET preview that powers the confirmation dialog, the
 * re-send cooldown (409) and its force override, delivery to registered
 * participants, exclusion of cancelled registrations / non-registrants /
 * disabled accounts, the empty-event case, auth, and a missing event.
 * Cleans up after itself.
 */
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const TAG = `rem${Date.now()}`;

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { if (ok) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? '  -> ' + d : ''}`); } };
const section = (s) => console.log(`\n--- ${s} ---`);
const cookie = (c) => 'token=' + jwt.sign(c, SECRET, { expiresIn: '30m' });

async function api(p, { cookie: ck, method = 'GET', body } = {}) {
  const res = await fetch(BASE + p, {
    method,
    headers: { ...(ck ? { cookie: ck } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
async function waitForServer() {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/api/admin/broadcast')).status === 401) return; } catch {} await new Promise(r => setTimeout(r, 2000)); }
  throw new Error('server not reachable');
}

(async () => {
  if (!SECRET) throw new Error('JWT_SECRET required');
  await waitForServer();

  const admin = await prisma.admin.upsert({ where: { username: `${TAG}-admin` }, update: {}, create: { username: `${TAG}-admin`, passwordHash: 'x' } });
  const aCookie = cookie({ id: admin.id, username: admin.username, role: 'admin' });

  const settings = await prisma.emailSettings.findFirst();
  const saved = { ...settings }; delete saved.id; delete saved.updatedAt;
  await prisma.emailSettings.update({ where: { id: settings.id }, data: {
    enabled: true, host: '127.0.0.1', port: 2599, secure: false, username: '', password: '',
    fromEmail: `noreply@${TAG}.test`, fromName: 'T', adminInboxEmail: '' } });

  const mk = (e, extra = {}) => prisma.participant.create({ data: { email: e, fullName: e.split('@')[0], status: 'approved', ...extra } });
  const going    = await mk(`${TAG}-going@t.local`);
  const going2   = await mk(`${TAG}-going2@t.local`);
  const cancelled= await mk(`${TAG}-cancelled@t.local`);
  const disabled = await mk(`${TAG}-disabled@t.local`, { isDisabled: true, disabledAt: new Date() });
  const notGoing = await mk(`${TAG}-notgoing@t.local`);

  const ev = await prisma.event.create({ data: {
    title: `${TAG} ورشة`, description: 'd', type: 'workshop',
    startDate: new Date('2026-10-01T09:00:00Z'), endDate: new Date('2026-10-01T11:00:00Z'),
    location: 'القاعة الكبرى', capacity: 50, presenter: 'م', plan: 'خ' } });
  const emptyEv = await prisma.event.create({ data: {
    title: `${TAG} فارغة`, description: 'd', type: 'workshop',
    startDate: new Date('2026-10-02T09:00:00Z'), endDate: new Date('2026-10-02T11:00:00Z'),
    location: 'قاعة', capacity: 10, presenter: 'م', plan: 'خ' } });

  const reg = (p, status = 'registered') => prisma.eventRegistration.create({ data: { participantId: p.id, eventId: ev.id, status } });
  await reg(going); await reg(going2); await reg(disabled); await reg(cancelled, 'cancelled');

  section('GET preview (powers the confirmation dialog)');
  let r = await api(`/api/admin/events/${ev.id}/remind`, { cookie: aCookie });
  check('preview 200', r.status === 200, JSON.stringify(r.json));
  check('preview reports 2 eligible recipients', r.json.recipientCount === 2, JSON.stringify(r.json));
  check('preview reports no previous send yet', r.json.lastReminderAt === null, JSON.stringify(r.json.lastReminderAt));
  check('preview returns the event title + cooldown', r.json.eventTitle === `${TAG} ورشة` && r.json.cooldownMinutes > 0, JSON.stringify(r.json));
  r = await api(`/api/admin/events/${ev.id}/remind`);
  check('preview without admin cookie -> 401', r.status === 401, String(r.status));
  const notifsBeforeSend = await prisma.notification.count({ where: { relatedEntityId: ev.id } });
  check('preview sent NOTHING (no notifications created)', notifsBeforeSend === 0, String(notifsBeforeSend));

  section('send the reminder');
  r = await api(`/api/admin/events/${ev.id}/remind`, { cookie: aCookie, method: 'POST' });
  check('200 success', r.status === 200 && r.json.success === true, JSON.stringify(r.json));
  check('recipientCount = 2 (registered & active only)', r.json.recipientCount === 2, JSON.stringify(r.json));

  section('dashboard notifications');
  const notifs = await prisma.notification.findMany({ where: { relatedEntityType: 'event', relatedEntityId: ev.id } });
  const ids = notifs.map((n) => n.recipientId);
  check('registered participants got a dashboard notification', ids.includes(going.id) && ids.includes(going2.id), JSON.stringify(ids));
  check('cancelled registration got NOTHING', !ids.includes(cancelled.id));
  check('disabled account got NOTHING', !ids.includes(disabled.id));
  check('non-registrant got NOTHING', !ids.includes(notGoing.id));
  check('exactly 2 notifications', notifs.length === 2, String(notifs.length));
  check('notification text contains the event title', notifs[0].message.includes(`${TAG} ورشة`), notifs[0].message);
  check('notification links to the events page', notifs[0].actionUrl === '/participant-dashboard/events', String(notifs[0].actionUrl));

  section('email');
  const logs = await prisma.emailLog.findMany({ where: { templateKey: 'eventReminderManual' } });
  check('an email was attempted for the reminder', logs.length > 0, `${logs.length} rows`);
  const totalEmailed = logs.reduce((a, l) => a + l.recipientCount, 0);
  check('emailed exactly the 2 eligible participants', totalEmailed === 2, String(totalEmailed));
  const stamped = await prisma.notification.findMany({ where: { relatedEntityId: ev.id }, select: { emailStatus: true } });
  check('email status stamped on the notifications', stamped.every((n) => n.emailStatus !== null), JSON.stringify(stamped));

  section('re-send cooldown (the double-send guard)');
  r = await api(`/api/admin/events/${ev.id}/remind`, { cookie: aCookie, method: 'POST' });
  check('immediate re-send refused with 409', r.status === 409 && r.json.cooldown === true, JSON.stringify(r.json));
  const afterDup = await prisma.notification.count({ where: { relatedEntityId: ev.id } });
  check('refused re-send created NO extra notifications', afterDup === 2, String(afterDup));
  r = await api(`/api/admin/events/${ev.id}/remind`, { cookie: aCookie });
  check('preview now reports lastReminderAt', Boolean(r.json.lastReminderAt), JSON.stringify(r.json.lastReminderAt));
  r = await api(`/api/admin/events/${ev.id}/remind`, { cookie: aCookie, method: 'POST', body: { force: true } });
  check('force:true overrides the cooldown', r.status === 200 && r.json.forced === true, JSON.stringify(r.json));
  const afterForce = await prisma.notification.count({ where: { relatedEntityId: ev.id } });
  check('forced re-send DID notify again (2 more)', afterForce === 4, String(afterForce));

  section('edge cases');
  r = await api(`/api/admin/events/${emptyEv.id}/remind`, { cookie: aCookie, method: 'POST' });
  check('event with no registrants -> 400 with a clear message', r.status === 400 && r.json.recipientCount === 0, JSON.stringify(r.json));
  r = await api(`/api/admin/events/does-not-exist/remind`, { cookie: aCookie, method: 'POST' });
  check('unknown event -> 404', r.status === 404, String(r.status));
  r = await api(`/api/admin/events/${ev.id}/remind`, { method: 'POST' });
  check('no admin cookie -> 401', r.status === 401, String(r.status));

  section('the template is admin-editable in settings');
  r = await api('/api/admin/email-templates', { cookie: aCookie });
  const tpl = (r.json.templates || []).find((t) => t.key === 'eventReminderManual');
  check('eventReminderManual appears in the settings list', Boolean(tpl));
  check('exposes eventTitle/eventDate/eventLocation', tpl && ['eventTitle', 'eventDate', 'eventLocation'].every((v) => tpl.variables.includes(v)), tpl && tpl.variables.join(','));

  section('cleanup');
  await prisma.eventRegistration.deleteMany({ where: { eventId: { in: [ev.id, emptyEv.id] } } });
  await prisma.notification.deleteMany({ where: { relatedEntityId: ev.id } });
  await prisma.emailLog.deleteMany({ where: { templateKey: 'eventReminderManual' } });
  await prisma.event.deleteMany({ where: { title: { startsWith: TAG } } });
  await prisma.participant.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.admin.delete({ where: { id: admin.id } });
  await prisma.emailSettings.update({ where: { id: settings.id }, data: saved });
  console.log('  cleaned up');

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('CRASH', e); await prisma.$disconnect(); process.exit(1); });
