/**
 * Golden path: the full user journey across every subsystem, using the real
 * HTTP endpoints a browser would call — including the login flow, which the
 * feature suites bypass by minting JWTs directly.
 *
 * public registration -> admin approval -> participant LOGIN -> dashboard data
 * -> event registration -> badge -> admin scans badge -> attendance stats
 * -> milestone -> notifications -> email -> mentor login.
 */
const path = require('path');
const REPO = '/Users/kha/Documents/Code/dyam_hackathon/dhwmk_alvira';
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const bcrypt = require(path.join(REPO, 'node_modules/bcryptjs'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const MAILPIT = process.env.MAILPIT_URL || 'http://localhost:8025';
const SECRET = process.env.JWT_SECRET;
const TAG = `gp${Date.now()}`;
const PASSWORD = 'GoldenPath!2026';

let pass = 0, fail = 0;
const made = { teams: [], participants: [], mentors: [], events: [], milestones: [] };

function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  -> ' + detail : ''}`); }
}
const section = (s) => console.log(`\n--- ${s} ---`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function req(url, { cookie, method = 'GET', body, raw } = {}) {
  const res = await fetch(BASE + url, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    ...(raw ? { body: raw } : {}),
    redirect: 'manual',
  });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json, setCookie: res.headers.get('set-cookie') };
}

async function main() {
  const admin = await prisma.admin.findFirst({ select: { id: true, username: true } });
  const aCookie = 'token=' + jwt.sign({ id: admin.id, username: admin.username, role: 'admin' }, SECRET, { expiresIn: '30m' });

  // point email at Mailpit so the whole notification+email path is exercised
  const settings = await prisma.emailSettings.findFirst();
  await prisma.emailSettings.update({
    where: { id: settings.id },
    data: {
      host: 'localhost', port: Number(process.env.MAILPIT_SMTP_PORT || 1025), secure: false, username: '', password: '',
      fromEmail: 'noreply@example.test', fromName: 'منصة دِيَم',
      adminInboxEmail: 'admins@example.test', enabled: true,
    },
  });
  await fetch(MAILPIT + '/api/v1/messages', { method: 'DELETE' });

  // ============ 1. public pages ============
  section('1. public pages reachable');
  for (const p of ['/', '/login', '/admin-login', '/register-team', '/main']) {
    check(`page ${p}`, (await fetch(BASE + p)).status === 200);
  }

  // ============ 2. public team registration ============
  section('2. public team registration (multipart, real endpoint)');
  const fd = new FormData();
  fd.set('registrationType', 'team');
  fd.set('isTeamRegistration', 'true');
  fd.set('teamName', `${TAG} فريق`);
  fd.set('hackathonTrack', 'مسار تجريبي');
  fd.set('ideaDescription', 'وصف الفكرة');
  fd.set('hearAboutUs', 'اختبار');
  fd.set('leaderInfo', JSON.stringify({ fullName: 'قائد الرحلة', email: `${TAG}-leader@t.test`, contactNumber: '0500000001', city: 'الرياض' }));
  fd.set('members', JSON.stringify([{ fullName: 'عضو الرحلة', email: `${TAG}-member@t.test`, contactNumber: '0500000002', city: 'الرياض' }, { fullName: 'عضوة ثالثة', email: `${TAG}-member-b@t.test`, contactNumber: '0500000002', city: 'الرياض' }]));
  const regRes = await fetch(BASE + '/api/register-team', { method: 'POST', body: fd });
  check('registration accepted', regRes.status === 200 || regRes.status === 201, `status=${regRes.status}`);

  const team = await prisma.team.findFirst({ where: { teamName: `${TAG} فريق` }, include: { participants: true } });
  check('team + 3 members persisted', !!team && team.participants.length === 3, `members=${team?.participants?.length}`);
  made.teams.push(team.id);
  team.participants.forEach((p) => made.participants.push(p.id));
  const leader = team.participants.find((p) => p.isLeader) || team.participants[0];

  await wait(600);
  check('admins notified of the registration (dashboard row)',
    (await prisma.notification.count({ where: { recipientType: 'admin', relatedEntityId: team.id } })) > 0);
  const adminInbox = await (await fetch(MAILPIT + '/api/v1/messages?limit=50')).json();
  check('admin notification email sent to shared inbox',
    (adminInbox.messages || []).some((m) => (m.To || []).some((t) => t.Address === 'admins@example.test')));

  // ============ 3. admin approves ============
  section('3. admin approves the team');
  const approve = await req('/api/admin/approve-team', { method: 'POST', cookie: aCookie, body: { teamId: team.id } });
  check('approve-team succeeds', approve.status === 200, `status=${approve.status}`);
  const teamAfter = await prisma.team.findUnique({ where: { id: team.id } });
  check('  team status = approved', teamAfter.status === 'approved');
  await wait(600);
  check('  members notified in dashboard',
    (await prisma.notification.count({ where: { recipientId: leader.id } })) > 0);

  // approval generates a random password; set a known one to exercise real login
  await prisma.participant.update({
    where: { id: leader.id },
    data: { passwordHash: await bcrypt.hash(PASSWORD, 10) },
  });

  // ============ 4. real login ============
  section('4. participant logs in through /api/login');
  const badLogin = await req('/api/login', { method: 'POST', body: { email: leader.email, password: 'wrong-password' } });
  check('wrong password rejected 401', badLogin.status === 401, `status=${badLogin.status}`);

  const login = await req('/api/login', { method: 'POST', body: { email: leader.email, password: PASSWORD } });
  check('correct password accepted', login.status === 200, `status=${login.status} ${JSON.stringify(login.json)}`);
  check('  sets an httpOnly token cookie',
    !!login.setCookie && login.setCookie.includes('token=') && /httponly/i.test(login.setCookie));

  const tokenMatch = login.setCookie && login.setCookie.match(/token=([^;]+)/);
  const pCookie = tokenMatch ? `token=${tokenMatch[1]}` : null;
  check('  cookie is usable', !!pCookie);

  // ============ 5. participant dashboard data ============
  section('5. participant dashboard APIs (with the real login cookie)');
  const me = await req('/api/participant/me', { cookie: pCookie });
  check('/api/participant/me returns identity', me.status === 200 && me.json.email === leader.email);
  check('  team attached', me.json.team && me.json.team.teamName === `${TAG} فريق`);

  for (const [label, url] of [
    ['team-details', '/api/participant/team-details'],
    ['my-bookings', '/api/participant/my-bookings'],
    ['notifications', '/api/notifications'],
    ['events (public)', '/api/events'],
    ['milestones (public)', '/api/milestones'],
  ]) {
    const r = await req(url, { cookie: pCookie });
    check(`  ${label} -> 200`, r.status === 200, `status=${r.status}`);
  }
  // by design: someone already in a team cannot browse teams to join
  const avail = await req('/api/participant/available-teams', { cookie: pCookie });
  check('  available-teams -> 403 for a participant who has a team (by design)',
    avail.status === 403, `status=${avail.status}`);

  // ============ 6. badge ============
  section('6. digital badge');
  const badge = await req('/api/participant/badge', { cookie: pCookie });
  check('badge issued', badge.status === 200 && /^MAYDA-[A-Z2-9]{12}$/.test(badge.json.badgeCode), JSON.stringify(badge.json));
  check('  shows name + team', badge.json.fullName === 'قائد الرحلة' && badge.json.teamName === `${TAG} فريق`);
  const badgeCode = badge.json.badgeCode;
  check('badge page renders', (await fetch(BASE + '/participant-dashboard/badge')).status === 200);

  // ============ 7. event registration ============
  section('7. event registration + emails');
  const event = await prisma.event.create({
    data: { title: `${TAG} فعالية`, description: 'د', startDate: new Date(Date.now() + 864e5), endDate: new Date(Date.now() + 9e8), location: 'القاعة', capacity: 50, type: 'ورشة', plan: 'خ', presenter: 'م', status: 'upcoming' },
  });
  made.events.push(event.id);
  await fetch(MAILPIT + '/api/v1/messages', { method: 'DELETE' });

  const evReg = await req('/api/participant/register-event', { method: 'POST', cookie: pCookie, body: { eventId: event.id } });
  check('participant registers for the event', evReg.status === 200 || evReg.status === 201, `status=${evReg.status}`);
  await wait(700);
  const evMail = await (await fetch(MAILPIT + '/api/v1/messages?limit=50')).json();
  check('  confirmation email reached the participant',
    (evMail.messages || []).some((m) => [...(m.To || []), ...(m.Bcc || [])].some((t) => t.Address === leader.email)));

  // ============ 8. attendance scan ============
  section('8. admin scans the badge at the event');
  const scan = await req('/api/admin/attendance/scan', {
    method: 'POST', cookie: aCookie, body: { badgeCode, mode: 'event', eventId: event.id, method: 'scan' },
  });
  check('scan records attendance', scan.status === 200 && scan.json.result === 'attended', JSON.stringify(scan.json));
  check('  door display shows name + team', scan.json.fullName === 'قائد الرحلة' && scan.json.teamName === `${TAG} فريق`);

  const stats = await req(`/api/admin/attendance?mode=event&eventId=${event.id}`, { cookie: aCookie });
  check('attendance stats reflect the scan',
    stats.status === 200 && stats.json.counts.attended === 1 && stats.json.rows[0].name === 'قائد الرحلة',
    JSON.stringify(stats.json.counts));
  check('  scan time + method recorded', stats.json.rows[0].scannedAt && stats.json.rows[0].method === 'scan');

  // the non-registered teammate must be rejected
  const mate = team.participants.find((p) => p.id !== leader.id);
  const mateBadge = await prisma.participant.update({ where: { id: mate.id }, data: { badgeCode: 'MAYDA-MATETESTCODE' } });
  const reject = await req('/api/admin/attendance/scan', {
    method: 'POST', cookie: aCookie, body: { badgeCode: mateBadge.badgeCode, mode: 'event', eventId: event.id },
  });
  check('unregistered teammate rejected (strict door policy)',
    reject.status === 409 && reject.json.result === 'notRegistered', `status=${reject.status}`);

  // ============ 9. milestone fan-out ============
  section('9. milestone creation notifies participants');
  const ms = await req('/api/admin/milestones', {
    method: 'POST', cookie: aCookie,
    body: { title: `${TAG} مرحلة`, description: 'د', dueDate: new Date(Date.now() + 6048e5).toISOString(), requirements: ['ر'] },
  });
  check('milestone created', ms.status === 200 || ms.status === 201, `status=${ms.status}`);
  const milestone = await prisma.milestone.findFirst({ where: { title: `${TAG} مرحلة` } });
  if (milestone) made.milestones.push(milestone.id);
  await wait(900);
  check('  participant notified of the new milestone',
    (await prisma.notification.count({ where: { recipientId: leader.id, relatedEntityId: milestone.id } })) === 1);

  const bell = await req('/api/notifications?limit=20', { cookie: pCookie });
  check('participant bell shows the whole journey',
    bell.status === 200 && bell.json.total >= 3, `total=${bell.json.total}`);
  check('  emails marked as sent on the rows',
    bell.json.notifications.some((n) => n.emailStatus === 'sent'));

  // ============ 10. mentor journey ============
  section('10. mentor login + dashboard');
  const mentorPass = await bcrypt.hash(PASSWORD, 10);
  const mentor = await prisma.mentor.create({
    data: { name: `${TAG} مرشد`, email: `${TAG}-mentor@t.test`, specialty: 'تقنية', phone: '0500000009', status: 'active', passwordHash: mentorPass },
  });
  made.mentors.push(mentor.id);
  const mLogin = await req('/api/login', { method: 'POST', body: { email: mentor.email, password: PASSWORD } });
  check('mentor logs in', mLogin.status === 200, `status=${mLogin.status}`);
  const mTok = mLogin.setCookie && mLogin.setCookie.match(/token=([^;]+)/);
  const mCookie = mTok ? `token=${mTok[1]}` : null;
  const mMe = await req('/api/mentor/me', { cookie: mCookie });
  check('  /api/mentor/me works', mMe.status === 200 && mMe.json.email === mentor.email, `status=${mMe.status}`);
  check('  mentor notifications work', (await req('/api/notifications', { cookie: mCookie })).status === 200);

  // ============ 11. logout ============
  section('11. logout');
  const logout = await req('/api/logout', { method: 'POST', cookie: pCookie });
  check('logout responds', logout.status === 200, `status=${logout.status}`);
  check('  clears the cookie', !!logout.setCookie && /token=;|Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(logout.setCookie),
    logout.setCookie);
}

main()
  .catch((e) => { fail++; console.error('SCRIPT ERROR:', e.stack); })
  .finally(async () => {
    section('cleanup');
    const settings = await prisma.emailSettings.findFirst();
    await prisma.emailSettings.update({
      where: { id: settings.id },
      data: { host: '', port: 587, secure: false, username: '', password: '', fromEmail: '', fromName: '', adminInboxEmail: '', enabled: false },
    });
    await prisma.emailLog.deleteMany({});
    await prisma.notification.deleteMany({});
    await prisma.attendanceRecord.deleteMany({ where: { participantId: { in: made.participants } } });
    await prisma.eventRegistration.deleteMany({ where: { eventId: { in: made.events } } });
    await prisma.event.deleteMany({ where: { id: { in: made.events } } });
    await prisma.milestoneSubmission.deleteMany({ where: { milestoneId: { in: made.milestones } } });
    await prisma.milestone.deleteMany({ where: { id: { in: made.milestones } } });
    await prisma.teamJoinRequest.deleteMany({ where: { teamId: { in: made.teams } } });
    await prisma.participant.deleteMany({ where: { id: { in: made.participants } } });
    await prisma.team.deleteMany({ where: { id: { in: made.teams } } });
    await prisma.mentor.deleteMany({ where: { id: { in: made.mentors } } });
    await fetch(MAILPIT + '/api/v1/messages', { method: 'DELETE' });
    console.log(`  DB — participants: ${await prisma.participant.count()}, teams: ${await prisma.team.count()}, notifications: ${await prisma.notification.count()}`);
    console.log(`\n${pass} passed, ${fail} failed`);
    await prisma.$disconnect();
    process.exit(fail === 0 ? 0 : 1);
  });
