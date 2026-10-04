/**
 * Phase 2 e2e: DB-backed templates — merged list API, edit changes real
 * dashboard notifications, reset restores defaults, placeholder validation,
 * auth gates, and email stays dark (Mailpit must remain empty).
 */
const path = require('path');
const REPO = '/Users/kha/Documents/Code/dyam_hackathon/dhwmk_alvira';
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const MAILPIT = process.env.MAILPIT_URL || 'http://localhost:8025';
const SECRET = process.env.JWT_SECRET;
const TAG = `p2-${Date.now()}`;

let pass = 0, fail = 0;
const made = { teams: [], participants: [] };

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

async function main() {
  const admin = await prisma.admin.findFirst({ select: { id: true, username: true } });
  const aCookie = 'token=' + jwt.sign({ id: admin.id, username: admin.username, role: 'admin' }, SECRET, { expiresIn: '30m' });

  await fetch(MAILPIT + '/api/v1/messages', { method: 'DELETE' });

  section('templates list API');
  const noAuth = await api('/api/admin/email-templates');
  check('list requires admin -> 401', noAuth.status === 401, `status=${noAuth.status}`);

  const list = await api('/api/admin/email-templates', { cookie: aCookie });
  check('list returns templates', list.status === 200 && Array.isArray(list.json.templates));
  const count = list.json.templates.length;
  check(`  registry has all keys (>= 24)`, count >= 24, `count=${count}`);
  check('  none customized initially', list.json.templates.every(t => !t.isCustomized));
  const approval = list.json.templates.find(t => t.key === 'teamApproval');
  check('  teamApproval default text intact',
    approval && approval.dashboardTitle === 'تم قبول فريقك!' &&
    approval.dashboardMessage === 'تهانينا! تم قبول فريق {{teamName}} في الهاكثون');
  check('  inline-site keys present (participantApproval, participantCreated, bookingConfirmation)',
    ['participantApproval', 'participantCreated', 'bookingConfirmation', 'milestoneReviewAccepted']
      .every(k => list.json.templates.some(t => t.key === k)));

  section('placeholder validation');
  const badPut = await api('/api/admin/email-templates/teamApproval', {
    method: 'PUT', cookie: aCookie,
    body: { dashboardMessage: 'فريق {{unknownVar}} مقبول' },
  });
  check('unknown {{placeholder}} rejected 400', badPut.status === 400, `status=${badPut.status}`);
  const unknownKey = await api('/api/admin/email-templates/notARealKey', {
    method: 'PUT', cookie: aCookie, body: {},
  });
  check('unknown template key -> 404', unknownKey.status === 404, `status=${unknownKey.status}`);

  section('edited template drives a REAL notification');
  // customize teamApproval dashboard title+message
  const customTitle = `[${TAG}] قبول مخصص`;
  const customMsg = `فريق {{teamName}} تم قبوله — نص معدل ${TAG}`;
  const put = await api('/api/admin/email-templates/teamApproval', {
    method: 'PUT', cookie: aCookie,
    body: { dashboardTitle: customTitle, dashboardMessage: customMsg },
  });
  check('PUT customization saved', put.status === 200, `status=${put.status} ${JSON.stringify(put.json)}`);

  // trigger the real approve-team flow
  const team = await prisma.team.create({ data: { teamName: `${TAG} فريق`, status: 'pending', isTeamRegistration: true } });
  made.teams.push(team.id);
  const member = await prisma.participant.create({
    data: { email: `${TAG}-m@example.invalid`, fullName: 'عضو', teamId: team.id, isLeader: true },
  });
  made.participants.push(member.id);

  const approve = await api('/api/admin/approve-team', { method: 'POST', cookie: aCookie, body: { teamId: team.id } });
  check('approve-team still succeeds', approve.status === 200, `status=${approve.status}`);

  const notif = await prisma.notification.findFirst({
    where: { recipientId: member.id, recipientType: 'participant' },
    orderBy: { createdAt: 'desc' },
  });
  check('dashboard row uses the EDITED title', notif?.title === customTitle, notif?.title);
  check('  edited message rendered with variables', notif?.message === `فريق ${TAG} فريق تم قبوله — نص معدل ${TAG}`, notif?.message);
  check('  type still comes from code (success)', notif?.type === 'success', notif?.type);
  check('  actionUrl default preserved', notif?.actionUrl === '/participant-dashboard', notif?.actionUrl);
  check('  emailStatus null (email dark)', notif?.emailStatus === null, String(notif?.emailStatus));

  section('reset to default');
  const listNow = await api('/api/admin/email-templates', { cookie: aCookie });
  check('teamApproval flagged isCustomized', listNow.json.templates.find(t => t.key === 'teamApproval')?.isCustomized === true);

  const reset = await api('/api/admin/email-templates/teamApproval', { method: 'DELETE', cookie: aCookie });
  check('reset succeeds', reset.status === 200, `status=${reset.status}`);

  // trigger again on a fresh team -> default text
  const team2 = await prisma.team.create({ data: { teamName: `${TAG} فريق2`, status: 'pending', isTeamRegistration: true } });
  made.teams.push(team2.id);
  const member2 = await prisma.participant.create({
    data: { email: `${TAG}-m2@example.invalid`, fullName: 'عضو2', teamId: team2.id, isLeader: true },
  });
  made.participants.push(member2.id);
  await api('/api/admin/approve-team', { method: 'POST', cookie: aCookie, body: { teamId: team2.id } });
  const notif2 = await prisma.notification.findFirst({ where: { recipientId: member2.id } });
  check('after reset, default text returns', notif2?.title === 'تم قبول فريقك!', notif2?.title);

  section('email still dark');
  const inbox = await (await fetch(MAILPIT + '/api/v1/messages')).json();
  check('zero emails sent during all of the above', inbox.total === 0, `total=${inbox.total}`);
  const settings = await prisma.emailSettings.findFirst();
  check('EmailSettings.enabled is still false', settings.enabled === false);
  check('no EmailLog rows written', (await prisma.emailLog.count()) === 0);
}

main()
  .catch((e) => { fail++; console.error('\nSCRIPT ERROR:', e.stack); })
  .finally(async () => {
    await prisma.notification.deleteMany({ where: { OR: [
      { recipientId: { in: made.participants } },
      { message: { contains: TAG } },
      { relatedEntityId: { in: made.teams } },
    ] } });
    await prisma.notificationTemplate.deleteMany({ where: { key: 'teamApproval' } });
    await prisma.participant.deleteMany({ where: { id: { in: made.participants } } });
    await prisma.team.deleteMany({ where: { id: { in: made.teams } } });
    console.log(`\ncleanup done; templates table rows: ${await prisma.notificationTemplate.count()}, notifications: ${await prisma.notification.count()}`);
    console.log(`\n${pass} passed, ${fail} failed`);
    await prisma.$disconnect();
    process.exit(fail === 0 ? 0 : 1);
  });
