/**
 * Phase 3 e2e: live email dispatch through every major flow, asserted via
 * Mailpit; emailStatus stamping; BCC batching; failure isolation; HTML
 * escaping; per-template opt-out; blank admin inbox; milestones auth.
 */
const path = require('path');
const REPO = '/Users/kha/Documents/Code/dyam_hackathon/dhwmk_alvira';
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const MAILPIT = process.env.MAILPIT_URL || 'http://localhost:8025';
const SECRET = process.env.JWT_SECRET;
const TAG = `p3${Date.now()}`;

let pass = 0, fail = 0;
const made = { teams: [], participants: [], mentors: [], events: [], milestones: [], availabilities: [] };

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

/** All messages addressed to addr via To OR Bcc (BCC batches use Bcc). */
async function inboxFor(addr) {
  const data = await mp('/api/v1/messages?limit=200');
  return (data.messages || []).filter(
    (m) =>
      (m.To || []).some((t) => t.Address === addr) ||
      (m.Bcc || []).some((t) => t.Address === addr)
  );
}

async function main() {
  const admin = await prisma.admin.findFirst({ select: { id: true, username: true } });
  const admins = await prisma.admin.findMany({ select: { id: true } });
  const aCookie = 'token=' + jwt.sign({ id: admin.id, username: admin.username, role: 'admin' }, SECRET, { expiresIn: '30m' });
  const pCookieFor = (id, extra = {}) =>
    'token=' + jwt.sign({ id, participantId: id, role: 'participant', ...extra }, SECRET, { expiresIn: '30m' });

  const settingsRow = await prisma.emailSettings.findFirst();
  const originalSettings = { ...settingsRow };

  // enable email -> Mailpit
  await prisma.emailSettings.update({
    where: { id: settingsRow.id },
    data: {
      host: 'localhost', port: Number(process.env.MAILPIT_SMTP_PORT || 1025), secure: false, username: '', password: '',
      fromEmail: 'noreply@example.test', fromName: 'منصة دِيَم',
      adminInboxEmail: 'admins@example.test', enabled: true,
    },
  });
  await clearMp();

  // ============ team approval -> member emails ============
  section('team approval -> member emails');
  const team = await prisma.team.create({ data: { teamName: `<b>&${TAG}</b>`, status: 'pending', isTeamRegistration: true } });
  made.teams.push(team.id);
  const m1 = await prisma.participant.create({ data: { email: `${TAG}-m1@t.test`, fullName: 'عضو ١', teamId: team.id, isLeader: true } });
  const m2 = await prisma.participant.create({ data: { email: `${TAG}-m2@t.test`, fullName: 'عضو ٢', teamId: team.id } });
  made.participants.push(m1.id, m2.id);

  const approve = await api('/api/admin/approve-team', { method: 'POST', cookie: aCookie, body: { teamId: team.id } });
  check('approve-team succeeds', approve.status === 200, `status=${approve.status}`);
  await wait(700);

  const m1Mail = await inboxFor(`${TAG}-m1@t.test`);
  const m2Mail = await inboxFor(`${TAG}-m2@t.test`);
  check('both team members received the email (one credentials email each)', m1Mail.length === 1 && m2Mail.length === 1,
    `m1=${m1Mail.length} m2=${m2Mail.length}`);
  // Per-member credentials emails (commit cdecf61): each member gets their
  // own message with their own password, so TWO SMTP messages — not one BCC.
  check('  delivered as TWO SMTP messages (per-member credentials)', (await mp('/api/v1/messages')).total === 2);
  check('  subject matches credentials template',
    m1Mail[0]?.Subject === `تم قبول فريق <b>&${TAG}</b> — بيانات الدخول إلى حسابك`, m1Mail[0]?.Subject);

  const full = await mp(`/api/v1/message/${m1Mail[0].ID}`);
  check('  RTL wrapper in HTML', full.HTML.includes('dir="rtl"'));
  check('  HTML-escaped team name (<b>&…</b> not raw)',
    full.HTML.includes('&lt;b&gt;') && !full.HTML.replace(/<br>/g, '').includes(`<b>&${TAG}</b>`),
    full.HTML.slice(full.HTML.indexOf('&lt;') , full.HTML.indexOf('&lt;') + 40));

  const rows = await prisma.notification.findMany({ where: { recipientId: { in: [m1.id, m2.id] } } });
  check('  both rows stamped emailStatus=sent', rows.length === 2 && rows.every(r => r.emailStatus === 'sent'),
    rows.map(r => r.emailStatus).join(','));
  const approvalLogs = await prisma.emailLog.findMany({ where: { templateKey: 'teamApproval' } });
  check('  one EmailLog row per member (recipientCount=1, messageId set)',
    approvalLogs.length === 2 && approvalLogs.every(l => l.recipientCount === 1 &&
      l.status === 'sent' && Boolean(l.messageId)),
    JSON.stringify(approvalLogs.map(l => ({ n: l.recipientCount, s: l.status }))));

  // ============ admin shared inbox: ONE email, all rows stamped ============
  section('event registration -> participant email + ONE shared admin inbox email');
  await clearMp();
  const event = await prisma.event.create({
    data: { title: `${TAG} فعالية`, description: 'د', startDate: new Date(Date.now() + 864e5), endDate: new Date(Date.now() + 9e8), location: 'ق', capacity: 100, type: 'ورشة', plan: 'خ', presenter: 'م', status: 'upcoming' },
  });
  made.events.push(event.id);

  const t0 = new Date();
  const reg = await api('/api/participant/register-event', { method: 'POST', cookie: pCookieFor(m1.id), body: { eventId: event.id } });
  check('register-event succeeds', reg.status === 200 || reg.status === 201, `status=${reg.status}`);
  await wait(700);

  check('participant got confirmation email', (await inboxFor(`${TAG}-m1@t.test`)).length === 1);
  const adminMail = await inboxFor('admins@example.test');
  check('EXACTLY ONE email to the shared admin inbox', adminMail.length === 1, `count=${adminMail.length}`);

  const adminRows = await prisma.notification.findMany({
    where: { recipientType: 'admin', relatedEntityId: event.id, createdAt: { gte: t0 } },
  });
  check(`all ${admins.length} admin dashboard rows exist and are stamped sent`,
    adminRows.length === admins.length && adminRows.every(r => r.emailStatus === 'sent'),
    `rows=${adminRows.length} statuses=${adminRows.map(r => r.emailStatus).join(',')}`);

  // ============ bulk fan-out: milestone -> all participants, BCC batches ============
  section('milestone creation -> BCC batches to ALL participants');
  await clearMp();
  // seed 120 extra participants (batch size 50 -> 3 batches incl. the 2 team members)
  const bulkEmails = [];
  const bulkData = [];
  for (let i = 0; i < 120; i++) {
    const e = `${TAG}-bulk${i}@t.test`;
    bulkEmails.push(e);
    bulkData.push({ email: e, fullName: `مشارك ${i}`, status: 'approved' });
  }
  await prisma.participant.createMany({ data: bulkData });
  const bulkIds = (await prisma.participant.findMany({ where: { email: { in: bulkEmails } }, select: { id: true } })).map(p => p.id);
  made.participants.push(...bulkIds);

  const totalParticipants = await prisma.participant.count();
  const expectedBatches = Math.ceil(totalParticipants / 50);

  const ms = await api('/api/admin/milestones', {
    method: 'POST', cookie: aCookie,
    body: { title: `${TAG} مرحلة`, description: 'د', dueDate: new Date(Date.now() + 6048e5).toISOString(), requirements: ['ر'] },
  });
  check('milestone create succeeds (authed)', ms.status === 200 || ms.status === 201, `status=${ms.status}`);
  const milestone = await prisma.milestone.findFirst({ where: { title: `${TAG} مرحلة` } });
  if (milestone) made.milestones.push(milestone.id);
  await wait(1500);

  const inbox = await mp('/api/v1/messages');
  check(`BCC batching: ${expectedBatches} SMTP messages for ${totalParticipants} participants`,
    inbox.total === expectedBatches, `total=${inbox.total}`);

  const msRows = await prisma.notification.findMany({ where: { relatedEntityId: milestone.id } });
  check('every participant row stamped sent',
    msRows.length === totalParticipants && msRows.every(r => r.emailStatus === 'sent'),
    `rows=${msRows.length} sent=${msRows.filter(r => r.emailStatus === 'sent').length}`);

  const batchLogs = await prisma.emailLog.findMany({ where: { templateKey: 'newMilestoneAvailable' } });
  check('EmailLog: one row per batch with recipientCount',
    batchLogs.length === expectedBatches && batchLogs.reduce((s, l) => s + l.recipientCount, 0) === totalParticipants,
    `logs=${batchLogs.length} recipients=${batchLogs.reduce((s, l) => s + l.recipientCount, 0)}`);

  check('milestones POST without token -> 401', (await api('/api/admin/milestones', { method: 'POST', body: {} })).status === 401);

  // ============ per-template opt-out ============
  section('per-template email opt-out');
  await clearMp();
  await api('/api/admin/email-templates/teamRejection', {
    method: 'PUT', cookie: aCookie, body: { emailEnabled: false },
  });
  // reject-team only accepts PENDING teams — use a fresh one
  const pendTeam = await prisma.team.create({ data: { teamName: `${TAG} معلق`, status: 'pending', isTeamRegistration: true } });
  made.teams.push(pendTeam.id);
  const pendMember = await prisma.participant.create({ data: { email: `${TAG}-pm@t.test`, fullName: 'معلق', teamId: pendTeam.id } });
  made.participants.push(pendMember.id);

  const rej = await api('/api/admin/reject-team', { method: 'POST', cookie: aCookie, body: { teamId: pendTeam.id } });
  check('reject-team succeeds on pending team', rej.status === 200, `status=${rej.status} ${JSON.stringify(rej.json)}`);
  await wait(700);
  check('emailEnabled=false -> zero emails', (await mp('/api/v1/messages')).total === 0);
  const rejRows = await prisma.notification.findMany({ where: { recipientId: pendMember.id } });
  check('  dashboard row still created, emailStatus=null',
    rejRows.length === 1 && rejRows[0].emailStatus === null,
    `rows=${rejRows.length} status=${rejRows[0]?.emailStatus}`);
  await api('/api/admin/email-templates/teamRejection', { method: 'DELETE', cookie: aCookie });

  // ============ blank admin inbox ============
  section('blank admin inbox -> silent skip');
  await prisma.emailSettings.update({ where: { id: settingsRow.id }, data: { adminInboxEmail: '' } });
  await clearMp();
  const t2 = new Date();
  const mentorRes = await api('/api/admin/mentors', {
    method: 'POST', cookie: aCookie,
    body: { name: `${TAG} مرشد`, email: `${TAG}-mentor@t.test`, specialty: 'س', phone: '05', password: 'x12345' },
  });
  made.mentors.push(mentorRes.json?.id);
  await wait(700);
  check('no email attempted with blank inbox', (await mp('/api/v1/messages')).total === 0);
  const blankRows = await prisma.notification.findMany({
    where: { recipientType: 'admin', createdAt: { gte: t2 } },
  });
  check('  admin rows exist with emailStatus=null (never failed)',
    blankRows.length === admins.length && blankRows.every(r => r.emailStatus === null),
    blankRows.map(r => r.emailStatus).join(','));
  await prisma.emailSettings.update({ where: { id: settingsRow.id }, data: { adminInboxEmail: 'admins@example.test' } });

  // ============ mentor flow emails ============
  section('mentor booking + cancellation emails');
  await clearMp();
  const mentorId = mentorRes.json.id;
  await prisma.mentor.update({ where: { id: mentorId }, data: { status: 'active' } });
  const avail = await prisma.mentorAvailability.create({
    data: { mentorId, startTime: new Date(Date.now() + 864e5), endTime: new Date(Date.now() + 9e8) },
  });
  made.availabilities.push(avail.id);

  const book = await api('/api/participant/book-appointment', {
    method: 'POST', cookie: pCookieFor(m1.id), body: { availabilityId: avail.id },
  });
  check('booking succeeds', book.status === 200 || book.status === 201, `status=${book.status}`);
  await wait(700);
  check('mentor received booking-request email', (await inboxFor(`${TAG}-mentor@t.test`)).length === 1);
  check('participant received booking-confirmation email', (await inboxFor(`${TAG}-m1@t.test`)).length === 1);

  const booking = await prisma.mentorBooking.findFirst({ where: { availabilityId: avail.id } });
  await api(`/api/admin/mentor-bookings/${booking.id}`, { method: 'PATCH', cookie: aCookie, body: { status: 'cancelled' } });
  await wait(700);
  const mentorMails = await inboxFor(`${TAG}-mentor@t.test`);
  check('mentor received cancellation email', mentorMails.length === 2, `count=${mentorMails.length}`);

  // ============ SMTP failure isolation ============
  section('SMTP failure never breaks the business action');
  await prisma.emailSettings.update({ where: { id: settingsRow.id }, data: { port: 19999 } });
  const t3 = new Date();
  const approve2 = await api('/api/admin/approve-participant', {
    method: 'POST', cookie: aCookie, body: { participantId: bulkIds[0] },
  });
  check('approve-participant still succeeds with dead SMTP', approve2.status === 200, `status=${approve2.status}`);
  const failRow = await prisma.notification.findFirst({
    where: { recipientId: bulkIds[0], createdAt: { gte: t3 } },
  });
  check('  row stamped emailStatus=failed', failRow?.emailStatus === 'failed', String(failRow?.emailStatus));
  check('  EmailLog captured the error',
    (await prisma.emailLog.count({ where: { templateKey: 'participantApproval', status: 'failed', error: { not: null } } })) >= 1);
  await prisma.emailSettings.update({ where: { id: settingsRow.id }, data: { port: Number(process.env.MAILPIT_SMTP_PORT || 1025) } });

  // ============ badge data reaches the API ============
  section('emailStatus flows to the notifications API');
  const bell = await api('/api/notifications?limit=5', { cookie: pCookieFor(m1.id) });
  check('GET /api/notifications includes emailStatus field',
    bell.status === 200 && bell.json.notifications.some(n => n.emailStatus === 'sent'),
    JSON.stringify(bell.json.notifications?.map(n => n.emailStatus)));
}

main()
  .catch((e) => { fail++; console.error('\nSCRIPT ERROR:', e.stack); })
  .finally(async () => {
    section('cleanup');
    const settingsRow = await prisma.emailSettings.findFirst();
    // restore original (disabled) settings
    await prisma.emailSettings.update({
      where: { id: settingsRow.id },
      data: { host: '', port: 587, secure: false, username: '', password: '', fromEmail: '', fromName: '', adminInboxEmail: '', enabled: false },
    });
    await prisma.notificationTemplate.deleteMany({});
    await prisma.emailLog.deleteMany({});
    await prisma.notification.deleteMany({});
    await prisma.mentorBooking.deleteMany({ where: { availabilityId: { in: made.availabilities } } });
    await prisma.mentorAvailability.deleteMany({ where: { id: { in: made.availabilities } } });
    await prisma.mentor.deleteMany({ where: { id: { in: made.mentors.filter(Boolean) } } });
    await prisma.eventRegistration.deleteMany({ where: { eventId: { in: made.events } } });
    await prisma.event.deleteMany({ where: { id: { in: made.events } } });
    await prisma.milestoneSubmission.deleteMany({ where: { milestoneId: { in: made.milestones } } });
    await prisma.milestone.deleteMany({ where: { id: { in: made.milestones } } });
    await prisma.participant.deleteMany({ where: { id: { in: made.participants } } });
    await prisma.team.deleteMany({ where: { id: { in: made.teams } } });
    await fetch(MAILPIT + '/api/v1/messages', { method: 'DELETE' });
    console.log(`  DB after cleanup — participants: ${await prisma.participant.count()}, notifications: ${await prisma.notification.count()}, emailLogs: ${await prisma.emailLog.count()}`);
    console.log(`\n${pass} passed, ${fail} failed`);
    await prisma.$disconnect();
    process.exit(fail === 0 ? 0 : 1);
  });
