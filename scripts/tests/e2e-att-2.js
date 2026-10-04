/**
 * ATT Phase 2 e2e: scan / stats / undo APIs + the event-registrations auth fix.
 */
const path = require('path');
const REPO = '/Users/kha/Documents/Code/dyam_hackathon/dhwmk_alvira';
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const TAG = `att2-${Date.now()}`;

let pass = 0, fail = 0;
const made = { participants: [], teams: [], events: [] };

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
  const admin = await prisma.admin.findFirst();
  const aCookie = 'token=' + jwt.sign({ id: admin.id, username: admin.username, role: 'admin' }, SECRET, { expiresIn: '30m' });
  const pCookie = (id) => 'token=' + jwt.sign({ id, participantId: id, role: 'participant' }, SECRET, { expiresIn: '30m' });

  // fixtures
  const team = await prisma.team.create({ data: { teamName: `${TAG} فريق`, status: 'approved', isTeamRegistration: true } });
  made.teams.push(team.id);
  const mk = async (n, teamId = null) => {
    const p = await prisma.participant.create({ data: { email: `${TAG}-${n}@t.test`, fullName: `مشارك ${n}`, teamId } });
    made.participants.push(p.id);
    return p;
  };
  const pReg = await mk('reg', team.id);      // registered
  const pAbs = await mk('abs');               // will be pre-marked absent
  const pCan = await mk('can');               // cancelled registration
  const pNone = await mk('none');             // NOT registered
  const pGen = await mk('gen');               // general check-in

  const event = await prisma.event.create({
    data: { title: `${TAG} فعالية`, description: 'د', startDate: new Date(Date.now() + 864e5), endDate: new Date(Date.now() + 9e8), location: 'ق', capacity: 50, type: 'ورشة', plan: 'خ', presenter: 'م', status: 'upcoming' },
  });
  made.events.push(event.id);

  await prisma.eventRegistration.createMany({
    data: [
      { participantId: pReg.id, eventId: event.id, status: 'registered' },
      { participantId: pAbs.id, eventId: event.id, status: 'absent' },
      { participantId: pCan.id, eventId: event.id, status: 'cancelled' },
    ],
  });

  // badge codes via the real API
  const badge = async (p) => (await api('/api/participant/badge', { cookie: pCookie(p.id) })).json.badgeCode;
  const codeReg = await badge(pReg);
  const codeAbs = await badge(pAbs);
  const codeCan = await badge(pCan);
  const codeNone = await badge(pNone);
  const codeGen = await badge(pGen);

  section('auth gates');
  for (const [label, r] of [
    ['scan no cookie', await api('/api/admin/attendance/scan', { method: 'POST', body: {} })],
    ['stats no cookie', await api('/api/admin/attendance?mode=general')],
    ['undo no cookie', await api('/api/admin/attendance/undo', { method: 'POST', body: {} })],
    ['scan participant token', await api('/api/admin/attendance/scan', { method: 'POST', cookie: pCookie(pReg.id), body: {} })],
    ['event-registrations GET now gated', await api(`/api/admin/event-registrations/${event.id}`)],
    ['event-registrations PUT now gated', await api(`/api/admin/event-registrations/${event.id}`, { method: 'PUT', body: { registrationId: 'x', status: 'attended' } })],
  ]) {
    check(`${label} -> 401`, r.status === 401, `status=${r.status}`);
  }
  check('event-registrations GET with admin token still works',
    (await api(`/api/admin/event-registrations/${event.id}`, { cookie: aCookie })).status === 200);

  section('event mode scans');
  const scan = (badgeCode, extra = {}) =>
    api('/api/admin/attendance/scan', { method: 'POST', cookie: aCookie, body: { badgeCode, mode: 'event', eventId: event.id, ...extra } });

  const s1 = await scan(codeReg);
  check('registered -> attended', s1.status === 200 && s1.json.result === 'attended' && !s1.json.wasAbsent,
    JSON.stringify(s1.json));
  check('  response carries name + team', s1.json.fullName === 'مشارك reg' && s1.json.teamName === `${TAG} فريق`);

  const regAfter = await prisma.eventRegistration.findUnique({
    where: { participantId_eventId: { participantId: pReg.id, eventId: event.id } },
  });
  check('  EventRegistration.status = attended', regAfter.status === 'attended');

  const audit = await prisma.attendanceRecord.findUnique({
    where: { participantId_eventId: { participantId: pReg.id, eventId: event.id } },
  });
  check('  audit row: scannedBy=admin, method=scan', audit && audit.scannedBy === admin.id && audit.method === 'scan');

  const notif = await prisma.notification.findFirst({ where: { recipientId: pReg.id, title: 'تم تسجيل حضورك' } });
  check('  attendanceRecorded notification created', !!notif && notif.message.includes(`${TAG} فعالية`), notif?.message);

  const s2 = await scan(codeReg);
  check('re-scan -> alreadyAttended, no duplicate audit rows',
    s2.status === 200 && s2.json.result === 'alreadyAttended' &&
    (await prisma.attendanceRecord.count({ where: { participantId: pReg.id, eventId: event.id } })) === 1);

  const s3 = await scan(codeAbs);
  check('absent -> attended with wasAbsent flag', s3.status === 200 && s3.json.result === 'attended' && s3.json.wasAbsent === true,
    JSON.stringify(s3.json));

  const s4 = await scan(codeCan);
  check('cancelled -> 409, nothing written',
    s4.status === 409 && s4.json.result === 'cancelled' &&
    (await prisma.attendanceRecord.count({ where: { participantId: pCan.id } })) === 0);

  const s5 = await scan(codeNone);
  check('not registered -> 409 with identity, nothing written',
    s5.status === 409 && s5.json.result === 'notRegistered' && s5.json.fullName === 'مشارك none' &&
    (await prisma.attendanceRecord.count({ where: { participantId: pNone.id } })) === 0,
    JSON.stringify(s5.json));

  check('unknown badge -> 404', (await scan('INMAA-ZZZZZZZZZZZZ')).status === 404);
  check('manual method recorded', (await (async () => {
    // undo then re-scan pAbs manually to check method persistence
    await api('/api/admin/attendance/undo', { method: 'POST', cookie: aCookie, body: { participantId: pAbs.id, mode: 'event', eventId: event.id } });
    const r = await scan(codeAbs, { method: 'manual' });
    const row = await prisma.attendanceRecord.findUnique({ where: { participantId_eventId: { participantId: pAbs.id, eventId: event.id } } });
    return r.status === 200 && row?.method === 'manual';
  })()));

  section('general mode');
  const gscan = (badgeCode) =>
    api('/api/admin/attendance/scan', { method: 'POST', cookie: aCookie, body: { badgeCode, mode: 'general' } });

  const g1 = await gscan(codeGen);
  check('general check-in works', g1.status === 200 && g1.json.result === 'checkedIn' && /^\d{4}-\d{2}-\d{2}$/.test(g1.json.date),
    JSON.stringify(g1.json));
  const g2 = await gscan(codeGen);
  check('same-day duplicate -> alreadyCheckedIn, single row',
    g2.status === 200 && g2.json.result === 'alreadyCheckedIn' &&
    (await prisma.attendanceRecord.count({ where: { participantId: pGen.id, eventId: null } })) === 1);
  const g3 = await gscan(codeReg);
  check('different participant checks in fine', g3.status === 200 && g3.json.result === 'checkedIn');

  section('stats');
  const ev = await api(`/api/admin/attendance?mode=event&eventId=${event.id}`, { cookie: aCookie });
  check('event stats: counts correct',
    ev.status === 200 && ev.json.counts.registered === 3 && ev.json.counts.attended === 2 &&
    ev.json.counts.cancelled === 1 && ev.json.counts.remaining === 0,
    JSON.stringify(ev.json.counts));
  check('  rows carry name/team/status/scannedAt',
    ev.json.rows.every(r => r.name && 'teamName' in r && r.status) &&
    ev.json.rows.filter(r => r.status === 'attended').every(r => r.scannedAt));

  // manual marking via the events-page PUT must count too
  const regRow = await prisma.eventRegistration.findUnique({
    where: { participantId_eventId: { participantId: pCan.id, eventId: event.id } },
  });
  const manualPut = await api(`/api/admin/event-registrations/${event.id}`, {
    method: 'PUT', cookie: aCookie, body: { registrationId: regRow.id, status: 'attended' },
  });
  check('events-page manual PUT still works (authed)', manualPut.status === 200, `status=${manualPut.status}`);
  const ev2 = await api(`/api/admin/attendance?mode=event&eventId=${event.id}`, { cookie: aCookie });
  check('  manual marking counted by stats (attended=3)', ev2.json.counts.attended === 3, JSON.stringify(ev2.json.counts));

  const gen = await api(`/api/admin/attendance?mode=general&date=${g1.json.date}`, { cookie: aCookie });
  check('general stats: checked-in list + absentee diff',
    gen.status === 200 && gen.json.counts.checkedIn === 2 &&
    gen.json.checkedIn.some(r => r.participantId === pGen.id) &&
    gen.json.notCheckedIn.some(r => r.participantId === pNone.id) &&
    gen.json.counts.total === gen.json.counts.checkedIn + gen.json.counts.notCheckedIn,
    JSON.stringify(gen.json.counts));

  section('undo');
  const u1 = await api('/api/admin/attendance/undo', {
    method: 'POST', cookie: aCookie, body: { participantId: pReg.id, mode: 'event', eventId: event.id },
  });
  const regUndone = await prisma.eventRegistration.findUnique({
    where: { participantId_eventId: { participantId: pReg.id, eventId: event.id } },
  });
  check('event undo: status back to registered + audit row gone',
    u1.status === 200 && regUndone.status === 'registered' &&
    (await prisma.attendanceRecord.count({ where: { participantId: pReg.id, eventId: event.id } })) === 0);

  const u2 = await api('/api/admin/attendance/undo', {
    method: 'POST', cookie: aCookie, body: { participantId: pGen.id, mode: 'general', date: g1.json.date },
  });
  check('general undo removes the check-in',
    u2.status === 200 &&
    (await prisma.attendanceRecord.count({ where: { participantId: pGen.id, eventId: null } })) === 0);

  section('pages');
  check('attendance page renders 200', (await fetch(BASE + '/admin-hackton-dashboard/attendance')).status === 200);
}

main()
  .catch((e) => { fail++; console.error('SCRIPT ERROR:', e.stack); })
  .finally(async () => {
    await prisma.notification.deleteMany({ where: { recipientId: { in: made.participants } } });
    await prisma.attendanceRecord.deleteMany({ where: { participantId: { in: made.participants } } });
    await prisma.eventRegistration.deleteMany({ where: { eventId: { in: made.events } } });
    await prisma.event.deleteMany({ where: { id: { in: made.events } } });
    await prisma.participant.deleteMany({ where: { id: { in: made.participants } } });
    await prisma.team.deleteMany({ where: { id: { in: made.teams } } });
    console.log(`\ncleanup done; attendance rows left: ${await prisma.attendanceRecord.count()}`);
    console.log(`\n${pass} passed, ${fail} failed`);
    await prisma.$disconnect();
    process.exit(fail === 0 ? 0 : 1);
  });
