/**
 * End-to-end test for the admin "disable account" feature.
 *
 * Verifies, over real HTTP against a running app:
 *   - a disabled participant OR MENTOR cannot log in, and cannot call any action route
 *   - disabling a TEAM disables its members implicitly
 *   - disabled accounts are excluded from transactional notifications/emails
 *   - the broadcast "disabled-accounts" audience reaches ONLY them (the single
 *     deliberate exception), and "all-participants" excludes them
 *   - bulk disable/enable of many participants and teams in one request
 *   - re-enabling fully restores access
 *   - a disabled team is not joinable and a disabled participant cannot be
 *     accepted into a team
 *
 * Needs: running app (VERIFY_BASE_URL), its DATABASE_URL, matching JWT_SECRET.
 * Cleans up everything it creates. See mdfiles/disable-accounts.md.
 */
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const bcrypt = require(path.join(REPO, 'node_modules/bcryptjs'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const TAG = `dis${Date.now()}`;
const PW = 'TestPass123';

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  -> ' + detail : ''}`); }
};
const section = (s) => console.log(`\n--- ${s} ---`);
const cookie = (c) => 'token=' + jwt.sign(c, SECRET, { expiresIn: '30m' });
const pCookie = (p) => cookie({ id: p.id, participantId: p.id, email: p.email, role: 'participant', teamId: p.teamId, isLeader: p.isLeader });

async function api(pathname, { cookie: ck, method = 'GET', body } = {}) {
  const res = await fetch(BASE + pathname, {
    method,
    headers: { ...(ck ? { cookie: ck } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
const login = (email, password) => api('/api/login', { method: 'POST', body: { email, password } });

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(BASE + '/api/admin/broadcast')).status === 401) return; } catch {}
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('server not reachable at ' + BASE);
}

(async () => {
  if (!SECRET) throw new Error('JWT_SECRET required');
  await waitForServer();

  const hash = await bcrypt.hash(PW, 10);
  const admin = await prisma.admin.upsert({
    where: { username: `${TAG}-admin` }, update: {},
    create: { username: `${TAG}-admin`, passwordHash: 'x' },
  });
  const aCookie = cookie({ id: admin.id, username: admin.username, role: 'admin' });

  // email must be ON so broadcasts actually enqueue recipient rows
  const settings = await prisma.emailSettings.findFirst();
  const saved = { ...settings }; delete saved.id; delete saved.updatedAt;
  await prisma.emailSettings.update({
    where: { id: settings.id },
    data: { enabled: true, host: '127.0.0.1', port: 2599, secure: false, username: '', password: '',
            fromEmail: `noreply@${TAG}.test`, fromName: 'T', adminInboxEmail: '' },
  });

  // ---- fixtures -----------------------------------------------------------
  const mk = (email, extra = {}) => prisma.participant.create({
    data: { email, fullName: email.split('@')[0], passwordHash: hash, status: 'approved', ...extra },
  });
  const solo   = await mk(`${TAG}-solo@t.local`);       // will be disabled directly
  const solo2  = await mk(`${TAG}-solo2@t.local`);      // stays active (control)
  const bulkA  = await mk(`${TAG}-bulkA@t.local`);
  const bulkB  = await mk(`${TAG}-bulkB@t.local`);
  const joiner = await mk(`${TAG}-joiner@t.local`);     // disabled, tries to join

  const team = await prisma.team.create({ data: { teamName: `${TAG} team`, status: 'approved' } });
  const leader = await mk(`${TAG}-leader@t.local`, { teamId: team.id, isLeader: true });
  const member = await mk(`${TAG}-member@t.local`, { teamId: team.id });

  const openTeam = await prisma.team.create({ data: { teamName: `${TAG} open`, status: 'approved' } });
  await mk(`${TAG}-openlead@t.local`, { teamId: openTeam.id, isLeader: true });

  const mkMentor = (email) => prisma.mentor.create({
    data: { name: email.split('@')[0], email, specialty: 'AI', phone: '0500000000',
            status: 'active', passwordHash: hash },
  });
  const mentorOff = await mkMentor(`${TAG}-m-off@t.local`);   // will be disabled
  const mentorOn  = await mkMentor(`${TAG}-m-on@t.local`);    // control

  const disableApi = (payload) => api('/api/admin/accounts/disable', { cookie: aCookie, method: 'POST', body: payload });

  section('baseline: everyone can log in before disabling');
  check('solo logs in', (await login(solo.email, PW)).status === 200);
  check('team member logs in', (await login(member.email, PW)).status === 200);

  section('disable a single participant');
  let r = await disableApi({ participantIds: [solo.id], disabled: true });
  check('disable API 200, 1 updated', r.status === 200 && r.json.participantsUpdated === 1, JSON.stringify(r.json));
  r = await login(solo.email, PW);
  check('disabled participant CANNOT log in (403)', r.status === 403, `${r.status} ${JSON.stringify(r.json)}`);
  check('active control participant still logs in', (await login(solo2.email, PW)).status === 200);
  r = await api('/api/participant/me', { cookie: pCookie(solo) });
  check('/api/participant/me returns 403 (bounces dashboard)', r.status === 403, String(r.status));
  for (const [name, p, m, b] of [
    ['update-profile', '/api/participant/update-profile', 'POST', { fullName: 'x' }],
    ['join-request', '/api/participant/join-request', 'POST', { teamId: openTeam.id }],
    ['available-teams', '/api/participant/available-teams', 'GET', null],
    ['badge', '/api/participant/badge', 'GET', null],
    ['my-bookings', '/api/participant/my-bookings', 'GET', null],
    ['register-event', '/api/participant/register-event', 'GET', null],
  ]) {
    const res = await api(p, { cookie: pCookie(solo), method: m, body: b });
    check(`action blocked: ${name}`, res.status === 403 || res.status === 401, `got ${res.status}`);
  }

  section('disable a TEAM — members are disabled with it');
  r = await disableApi({ teamIds: [team.id], disabled: true });
  check('disable team API 200', r.status === 200 && r.json.teamsUpdated === 1, JSON.stringify(r.json));
  check('member of disabled team CANNOT log in', (await login(member.email, PW)).status === 403);
  check('leader of disabled team CANNOT log in', (await login(leader.email, PW)).status === 403);
  const memberRow = await prisma.participant.findUnique({ where: { id: member.id } });
  check('member row itself NOT rewritten (isDisabled stays false)', memberRow.isDisabled === false,
        `isDisabled=${memberRow.isDisabled}`);
  r = await api('/api/participant/team-details', { cookie: pCookie(member) });
  check('team-details blocked for member of disabled team', r.status === 403, String(r.status));

  section('transactional notifications skip disabled accounts');
  const before = await prisma.notification.count();
  await api('/api/admin/approve-participant', { cookie: aCookie, method: 'POST', body: { participantId: solo.id } });
  const afterNotifs = await prisma.notification.findMany({ where: { recipientId: solo.id } });
  check('no dashboard notification created for a disabled participant', afterNotifs.length === 0,
        `${afterNotifs.length} created`);
  const logs = await prisma.emailLog.findMany({ where: { templateKey: 'participantApproval', createdAt: { gte: new Date(Date.now() - 60000) } } });
  check('no transactional email logged for a disabled participant', logs.length === 0, `${logs.length} rows`);

  section('broadcast: all-participants EXCLUDES disabled');
  r = await api('/api/admin/broadcast', { cookie: aCookie, method: 'POST', body: {
    title: `${TAG} active`, body: 'hello', emailSubject: `${TAG} active`,
    channels: ['email'], audience: { type: 'all-participants' } } });
  check('broadcast 200', r.status === 200, JSON.stringify(r.json).slice(0, 120));
  let rows = await prisma.broadcastRecipient.findMany({ where: { broadcastId: r.json.broadcast.id }, select: { email: true } });
  let emails = rows.map((x) => x.email);
  check('disabled solo NOT targeted', !emails.includes(solo.email));
  check('disabled team members NOT targeted', !emails.includes(member.email) && !emails.includes(leader.email));
  check('active participant IS targeted', emails.includes(solo2.email), JSON.stringify(emails));

  section('broadcast: disabled-accounts reaches ONLY disabled (the exception)');
  r = await api('/api/admin/broadcast', { cookie: aCookie, method: 'POST', body: {
    title: `${TAG} sorry`, body: 'لم تتأهل للمرحلة القادمة', emailSubject: `${TAG} sorry`,
    channels: ['email'], audience: { type: 'disabled-accounts' } } });
  check('broadcast to disabled 200', r.status === 200, JSON.stringify(r.json).slice(0, 120));
  rows = await prisma.broadcastRecipient.findMany({ where: { broadcastId: r.json.broadcast.id }, select: { email: true } });
  emails = rows.map((x) => x.email);
  check('disabled solo IS targeted', emails.includes(solo.email));
  check('members of the disabled TEAM are targeted', emails.includes(member.email) && emails.includes(leader.email),
        JSON.stringify(emails));
  check('active participant NOT targeted', !emails.includes(solo2.email));

  section('disabled team is not joinable');
  r = await api('/api/participant/available-teams', { cookie: pCookie(solo2) });
  const listed = (r.json?.teams || r.json || []).map?.((t) => t.id) ?? [];
  check('disabled team absent from available-teams', !listed.includes(team.id), JSON.stringify(listed).slice(0, 120));

  section('a disabled participant cannot be accepted into a team');
  await disableApi({ participantIds: [joiner.id], disabled: true });
  const req = await prisma.teamJoinRequest.create({ data: { participantId: joiner.id, teamId: openTeam.id, status: 'pending' } });
  const openLeader = await prisma.participant.findFirst({ where: { teamId: openTeam.id, isLeader: true } });
  r = await api('/api/team-leader/handle-join-request', { cookie: pCookie(openLeader), method: 'POST', body: { requestId: req.id, action: 'accept' } });
  check('leader accepting a disabled joiner is refused (403)', r.status === 403, `${r.status} ${JSON.stringify(r.json)}`);
  const joinerRow = await prisma.participant.findUnique({ where: { id: joiner.id } });
  check('disabled joiner did NOT get added to the team', joinerRow.teamId === null, String(joinerRow.teamId));

  section('bulk disable / enable');
  r = await disableApi({ participantIds: [bulkA.id, bulkB.id, solo2.id], disabled: true });
  check('bulk disabled 3 participants in one call', r.status === 200 && r.json.participantsUpdated === 3, JSON.stringify(r.json));
  check('bulk-disabled account cannot log in', (await login(bulkA.email, PW)).status === 403);
  r = await disableApi({ participantIds: [bulkA.id, bulkB.id, solo2.id], disabled: false });
  check('bulk re-enabled 3', r.status === 200 && r.json.participantsUpdated === 3);
  check('re-enabled account CAN log in again', (await login(bulkA.email, PW)).status === 200);

  section('re-enable restores the team');
  await disableApi({ teamIds: [team.id], disabled: false });
  check('team member can log in after team re-enabled', (await login(member.email, PW)).status === 200);
  const t = await prisma.team.findUnique({ where: { id: team.id } });
  check('team disabledAt cleared', t.isDisabled === false && t.disabledAt === null);


  section('mentors: disable blocks login, actions and bookability');
  const mCookie = (m) => cookie({ id: m.id, mentorId: m.id, email: m.email, role: 'mentor' });
  check('mentor logs in before disabling', (await login(mentorOff.email, PW)).status === 200);
  r = await disableApi({ mentorIds: [mentorOff.id], disabled: true });
  check('disable mentor API 200, 1 updated', r.status === 200 && r.json.mentorsUpdated === 1, JSON.stringify(r.json));
  check('disabled mentor CANNOT log in (403)', (await login(mentorOff.email, PW)).status === 403);
  check('active mentor still logs in', (await login(mentorOn.email, PW)).status === 200);
  r = await api('/api/mentor/me', { cookie: mCookie(mentorOff) });
  check('/api/mentor/me 403 (bounces mentor dashboard)', r.status === 403, String(r.status));
  r = await api('/api/mentor/update-profile', { cookie: mCookie(mentorOff), method: 'PUT', body: { name: 'x' } });
  check('mentor update-profile blocked', r.status === 403, String(r.status));
  r = await api('/api/mentor/bookings', { cookie: mCookie(mentorOff) });
  check('mentor bookings blocked', r.status === 403, String(r.status));

  // participant-facing visibility
  r = await api('/api/admin/mentors', { cookie: pCookie(solo2) });
  let mentorIdsSeen = (Array.isArray(r.json) ? r.json : []).map((m) => m.id);
  check('disabled mentor hidden from a participant', !mentorIdsSeen.includes(mentorOff.id));
  check('active mentor still visible to a participant', mentorIdsSeen.includes(mentorOn.id), JSON.stringify(mentorIdsSeen));
  r = await api('/api/admin/mentors', { cookie: aCookie });
  mentorIdsSeen = (Array.isArray(r.json) ? r.json : []).map((m) => m.id);
  check('admin CAN still see the disabled mentor (to re-enable)', mentorIdsSeen.includes(mentorOff.id));

  section('mentors: notifications and broadcast audiences');
  const mNotifBefore = await prisma.notification.count({ where: { recipientId: mentorOff.id } });
  check('no notifications for disabled mentor at rest', mNotifBefore === 0);
  r = await api('/api/admin/broadcast', { cookie: aCookie, method: 'POST', body: {
    title: `${TAG} mentors`, body: 'hi', emailSubject: `${TAG} mentors`,
    channels: ['email'], audience: { type: 'all-mentors' } } });
  let mrows = await prisma.broadcastRecipient.findMany({ where: { broadcastId: r.json.broadcast.id }, select: { email: true } });
  let memails = mrows.map((x) => x.email);
  check('all-mentors EXCLUDES the disabled mentor', !memails.includes(mentorOff.email));
  check('all-mentors includes the active mentor', memails.includes(mentorOn.email), JSON.stringify(memails));
  r = await api('/api/admin/broadcast', { cookie: aCookie, method: 'POST', body: {
    title: `${TAG} dis2`, body: 'sorry', emailSubject: `${TAG} dis2`,
    channels: ['email'], audience: { type: 'disabled-accounts' } } });
  mrows = await prisma.broadcastRecipient.findMany({ where: { broadcastId: r.json.broadcast.id }, select: { email: true } });
  memails = mrows.map((x) => x.email);
  check('disabled-accounts INCLUDES the disabled mentor', memails.includes(mentorOff.email), JSON.stringify(memails));
  check('disabled-accounts excludes the active mentor', !memails.includes(mentorOn.email));

  section('mentors: re-enable');
  r = await disableApi({ mentorIds: [mentorOff.id], disabled: false });
  check('re-enable mentor 200', r.status === 200 && r.json.mentorsUpdated === 1);
  check('re-enabled mentor can log in again', (await login(mentorOff.email, PW)).status === 200);

  section('mixed bulk: participants + teams + mentors in ONE request');
  r = await disableApi({ participantIds: [bulkA.id], teamIds: [openTeam.id], mentorIds: [mentorOff.id], disabled: true });
  check('one call disabled 1 participant + 1 team + 1 mentor',
        r.status === 200 && r.json.participantsUpdated === 1 && r.json.teamsUpdated === 1 && r.json.mentorsUpdated === 1,
        JSON.stringify(r.json));
  check('participant from mixed bulk blocked', (await login(bulkA.email, PW)).status === 403);
  check('mentor from mixed bulk blocked', (await login(mentorOff.email, PW)).status === 403);
  await disableApi({ participantIds: [bulkA.id], teamIds: [openTeam.id], mentorIds: [mentorOff.id], disabled: false });

  section('validation + authorisation');
  r = await disableApi({ participantIds: [], teamIds: [], disabled: true });
  check('empty selection -> 400', r.status === 400, String(r.status));
  r = await disableApi({ participantIds: [solo.id] });
  check('missing `disabled` -> 400', r.status === 400, String(r.status));
  r = await api('/api/admin/accounts/disable', { method: 'POST', body: { participantIds: [solo.id], disabled: true } });
  check('no admin cookie -> 401', r.status === 401, String(r.status));

  section('cleanup');
  await prisma.teamJoinRequest.deleteMany({ where: { participantId: { in: [joiner.id] } } });
  await prisma.broadcastRecipient.deleteMany({ where: { broadcast: { title: { startsWith: TAG } } } });
  await prisma.emailLog.deleteMany({ where: { subject: { startsWith: TAG } } });
  await prisma.broadcast.deleteMany({ where: { title: { startsWith: TAG } } });
  await prisma.notification.deleteMany({ where: { recipientId: { in: [solo.id, solo2.id, member.id, leader.id, joiner.id, bulkA.id, bulkB.id] } } });
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
