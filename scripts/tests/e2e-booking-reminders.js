/**
 * e2e — 5-minute booking reminders (GET /api/cron/booking-reminders).
 *
 *   - 401 without / with a wrong CRON_SECRET;
 *   - a booking starting in 3 min: team members (participant side) get the
 *     participant reminder, the mentor gets the mentor reminder — dashboard
 *     rows + Mailpit emails carrying the Riyadh time and the TRACKED join link;
 *   - organization booking: every active member of the organization is reminded;
 *   - bookings 10 min away, cancelled, or already reminded are skipped; a second
 *     run sends nothing; reminderSentAt is stamped once.
 * Also: GET /api/admin/session-stats counters (booked / joined / completed).
 */
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const CRON = process.env.CRON_SECRET;
const MAILPIT = process.env.MAILPIT_URL || 'http://localhost:8025';
const TAG = `rem${Date.now()}`;
const MIN = 60_000;

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? '  -> ' + detail : ''}`); } };
const section = (s) => console.log(`\n--- ${s} ---`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cookie = (c) => 'token=' + jwt.sign(c, SECRET, { expiresIn: '30m' });
const mp = async (p) => (await fetch(MAILPIT + p)).json();
const clearMp = () => fetch(MAILPIT + '/api/v1/messages', { method: 'DELETE' });
// Team-wide templates go out as ONE BCC message, so match To AND Bcc.
async function mailFor(addr) {
  const data = await mp('/api/v1/messages?limit=200');
  return (data.messages || []).filter((m) => (m.To || []).some((t) => t.Address === addr) || (m.Bcc || []).some((t) => t.Address === addr));
}
async function mailText(id) { const m = await mp('/api/v1/message/' + id); return (m.Text || '') + '\n' + (m.HTML || ''); }
async function cron(secret) {
  const res = await fetch(`${BASE}/api/cron/booking-reminders`, { headers: secret ? { authorization: `Bearer ${secret}` } : {} });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
const riyadh = (d) => new Intl.DateTimeFormat('ar-SA', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit' }).format(d);

const made = { teams: [], participants: [], mentors: [], orgs: [] };
let savedSettings = null, settingsId = null;
(async () => {
  if (!SECRET) throw new Error('JWT_SECRET required');
  if (!CRON) throw new Error('CRON_SECRET required (same value the server was started with)');
  const admin = await prisma.admin.findFirst();
  const aCookie = cookie({ id: admin.id, username: admin.username, role: 'admin' });
  const settings = await prisma.emailSettings.findFirst();
  settingsId = settings.id; savedSettings = { ...settings }; delete savedSettings.id; delete savedSettings.updatedAt;
  await prisma.emailSettings.update({ where: { id: settings.id }, data: { enabled: true, host: 'localhost', port: 1025, secure: false, username: '', password: '', fromEmail: 'noreply@example.test', fromName: 'E2E', adminInboxEmail: '' } });
  await clearMp();

  const org = await prisma.organization.create({ data: { name: `${TAG} org` } }); made.orgs.push(org.id);
  const mkM = async (n, extra = {}) => { const m = await prisma.mentor.create({ data: { name: `${TAG} ${n}`, email: `${TAG}-${n}@e2e.test`, specialty: 'x', phone: '05', status: 'active', ...extra } }); made.mentors.push(m.id); return m; };
  const mentor = await mkM('mentor');
  const orgA = await mkM('orgA', { organizationId: org.id }), orgB = await mkM('orgB', { organizationId: org.id });
  const team = await prisma.team.create({ data: { teamName: `${TAG} team`, status: 'approved' } }); made.teams.push(team.id);
  const mkP = async (n, extra = {}) => { const p = await prisma.participant.create({ data: { email: `${TAG}-${n}@e2e.test`, fullName: `${TAG} ${n}`, status: 'approved', ...extra } }); made.participants.push(p.id); return p; };
  const leader = await mkP('leader', { teamId: team.id, isLeader: true }), mate = await mkP('mate', { teamId: team.id });
  const solo = await mkP('solo');
  const slot = async (mentorId, minutesAhead) => prisma.mentorAvailability.create({ data: { mentorId, startTime: new Date(Date.now() + minutesAhead * MIN), endTime: new Date(Date.now() + (minutesAhead + 15) * MIN) } });
  const sSoon = await slot(mentor.id, 3), sLater = await slot(mentor.id, 10), sCancel = await slot(mentor.id, 4), sOrg = await slot(orgA.id, 2), sSix = await slot(mentor.id, 12);
  const bSoon = await prisma.mentorBooking.create({ data: { participantId: leader.id, availabilityId: sSoon.id, status: 'booked', meetingUrl: 'https://meet.jit.si/Mayda-R1' } });
  const bLater = await prisma.mentorBooking.create({ data: { participantId: leader.id, availabilityId: sLater.id, status: 'booked', meetingUrl: 'https://meet.jit.si/Mayda-R2' } });
  const bCancel = await prisma.mentorBooking.create({ data: { participantId: solo.id, availabilityId: sCancel.id, status: 'cancelled', meetingUrl: 'https://meet.jit.si/Mayda-R3' } });
  const bOrg = await prisma.mentorBooking.create({ data: { participantId: solo.id, availabilityId: sOrg.id, status: 'booked', meetingUrl: 'https://meet.jit.si/Mayda-R4', organizationId: org.id } });
  const bSix = await prisma.mentorBooking.create({ data: { participantId: solo.id, availabilityId: sSix.id, status: 'booked', meetingUrl: 'https://meet.jit.si/Mayda-R5' } });

  section('auth');
  check('no secret -> 401', (await cron(null)).status === 401);
  check('wrong secret -> 401', (await cron('nope')).status === 401);

  section('run: only bookings within 5 minutes are reminded');
  let r = await cron(CRON);
  check('200 with due=2 reminded=2 (3-min team booking + 2-min org booking)', r.status === 200 && r.json?.due === 2 && r.json?.reminded === 2, JSON.stringify(r.json));
  const rows = await prisma.mentorBooking.findMany({ where: { id: { in: [bSoon.id, bLater.id, bCancel.id, bOrg.id] } } });
  const by = (id) => rows.find((x) => x.id === id);
  check('  reminderSentAt stamped on the two due bookings only', !!by(bSoon.id).reminderSentAt && !!by(bOrg.id).reminderSentAt && by(bLater.id).reminderSentAt === null && by(bCancel.id).reminderSentAt === null);
  await sleep(1200);

  section('team booking: participant + teammate + mentor');
  const nl = await prisma.notification.findMany({ where: { recipientId: leader.id, relatedEntityId: bSoon.id } });
  const nm = await prisma.notification.findMany({ where: { recipientId: mate.id, relatedEntityId: bSoon.id } });
  const nMentor = await prisma.notification.findMany({ where: { recipientId: mentor.id, relatedEntityId: bSoon.id } });
  check('dashboard: leader + teammate + mentor each got ONE reminder', nl.length === 1 && nm.length === 1 && nMentor.length === 1, `l=${nl.length} m=${nm.length} mentor=${nMentor.length}`);
  check('  dashboard text says 5 minutes + mentor/participant names', /خلال 5 دقائق/.test(nl[0]?.title || '') && (nl[0]?.message || '').includes(mentor.name) && (nMentor[0]?.message || '').includes(leader.fullName), `${nl[0]?.title} | ${nMentor[0]?.message}`);
  const expectTime = riyadh(sSoon.startTime), joinLink = `/api/meeting/join/${bSoon.id}`;
  const lm = await mailFor(leader.email), mm = await mailFor(mate.email), mentorMail = await mailFor(mentor.email);
  check('email: leader + teammate + mentor each got ONE reminder email', lm.length === 1 && mm.length === 1 && mentorMail.length === 1, `l=${lm.length} m=${mm.length} mentor=${mentorMail.length}`);
  const lt = lm[0] ? await mailText(lm[0].ID) : '';
  check(`  participant email has the Riyadh start time (${expectTime}), says 5 minutes, and the tracked join link`, lt.includes(expectTime) && /خلال 5 دقائق/.test(lt) && lt.includes(joinLink) && !lt.includes('meet.jit.si'), lt.slice(0, 160).replace(/\n/g, ' '));
  const mt = mentorMail[0] ? await mailText(mentorMail[0].ID) : '';
  check('  mentor email has the time, the participant name and the tracked link', mt.includes(expectTime) && mt.includes(leader.fullName) && mt.includes(joinLink));
  check('  the 10-minute booking got no reminder', (await prisma.notification.count({ where: { relatedEntityId: bLater.id } })) === 0 && (await mailFor(solo.email)).filter((x) => /R2/.test(x.Subject)).length === 0);

  section('organization booking: every active member is reminded');
  const nA = await prisma.notification.count({ where: { recipientId: orgA.id, relatedEntityId: bOrg.id } });
  const nB = await prisma.notification.count({ where: { recipientId: orgB.id, relatedEntityId: bOrg.id } });
  const nS = await prisma.notification.count({ where: { recipientId: solo.id, relatedEntityId: bOrg.id } });
  check('both org members + the booker reminded', nA === 1 && nB === 1 && nS === 1, `A=${nA} B=${nB} solo=${nS}`);
  check('  unrelated mentor not reminded for the org booking', (await prisma.notification.count({ where: { recipientId: mentor.id, relatedEntityId: bOrg.id } })) === 0);
  check('  org member emails carry the org booking join link', (await mailFor(orgB.email)).length === 1 && (await mailText((await mailFor(orgB.email))[0].ID)).includes(`/api/meeting/join/${bOrg.id}`));

  section('idempotent + timing: a 12-minute booking waits until it is 5 minutes away');
  r = await cron(CRON);
  check('second run: nothing due, nothing sent', r.status === 200 && r.json?.reminded === 0 && (await prisma.notification.count({ where: { recipientId: leader.id, relatedEntityId: bSoon.id } })) === 1, JSON.stringify(r.json));
  check('  12-minute booking not reminded yet', (await prisma.mentorBooking.findUnique({ where: { id: bSix.id } })).reminderSentAt === null);
  await prisma.mentorAvailability.update({ where: { id: sSix.id }, data: { startTime: new Date(Date.now() + 4.9 * MIN) } }); // time passes: now 4.9 min away
  r = await cron(CRON);
  check('  once inside the 5-minute window it is reminded (says 5 minutes)', r.json?.reminded === 1 && /خلال 5 دقائق/.test((await prisma.notification.findFirst({ where: { recipientId: solo.id, relatedEntityId: bSix.id } }))?.title || ''), JSON.stringify(r.json));

  section('session-stats counters');
  // leader joins bSoon, mentor joins bSoon -> completed; mate joins bLater only
  const join = (id, ck) => fetch(`${BASE}/api/meeting/join/${id}`, { headers: { cookie: ck }, redirect: 'manual' });
  await join(bSoon.id, cookie({ id: leader.id, participantId: leader.id, role: 'participant' }));
  await join(bSoon.id, cookie({ id: mentor.id, mentorId: mentor.id, role: 'mentor' }));
  await join(bLater.id, cookie({ id: mate.id, participantId: mate.id, role: 'participant' }));
  const st = await (await fetch(`${BASE}/api/admin/session-stats`, { headers: { cookie: aCookie } })).json();
  // "joined" is per booking on the participant side: the teammate's click on the
  // leader's second booking counts for that booking (= the booker).
  check('participant (leader): booked 2, joined 2, completed 1', JSON.stringify(st.participants[leader.id]) === JSON.stringify({ booked: 2, joined: 2, completed: 1 }), JSON.stringify(st.participants[leader.id]));
  check('team: booked 2, joined 2 (leader on one, mate on the other), completed 1', JSON.stringify(st.teams[team.id]) === JSON.stringify({ booked: 2, joined: 2, completed: 1 }), JSON.stringify(st.teams[team.id]));
  check('mentor: booked 3 (soon, later, 12-min), joined 1, completed 1', JSON.stringify(st.mentors[mentor.id]) === JSON.stringify({ booked: 3, joined: 1, completed: 1 }), JSON.stringify(st.mentors[mentor.id]));
  check('cancelled booking not counted for solo (org booking + 12-min booking only)', JSON.stringify(st.participants[solo.id]) === JSON.stringify({ booked: 2, joined: 0, completed: 0 }), JSON.stringify(st.participants[solo.id]));
  check('session-stats requires admin', (await fetch(`${BASE}/api/admin/session-stats`, { headers: { cookie: cookie({ id: leader.id, participantId: leader.id, role: 'participant' }) } })).status === 401);
  const adminMentors = await (await fetch(`${BASE}/api/admin/mentors`, { headers: { cookie: aCookie } })).json();
  const am = adminMentors.find((m) => m.id === mentor.id);
  check('admin mentors list carries sessionsJoined=1 / sessionsConfirmed=1', am?.sessionsJoined === 1 && am?.sessionsConfirmed === 1, JSON.stringify({ j: am?.sessionsJoined, c: am?.sessionsConfirmed }));
})()
  .catch((e) => { fail++; console.error('\nSCRIPT ERROR:', e.stack); })
  .finally(async () => {
    try {
      if (savedSettings && settingsId) await prisma.emailSettings.update({ where: { id: settingsId }, data: savedSettings });
      await prisma.emailLog.deleteMany({ where: { templateKey: { in: ['bookingReminderParticipant', 'bookingReminderMentor'] } } });
      await prisma.notification.deleteMany({ where: { recipientId: { in: [...made.participants, ...made.mentors] } } });
      await prisma.mentorBooking.deleteMany({ where: { participantId: { in: made.participants } } });
      await prisma.mentorAvailability.deleteMany({ where: { mentorId: { in: made.mentors } } });
      await prisma.participant.deleteMany({ where: { id: { in: made.participants } } });
      await prisma.team.deleteMany({ where: { id: { in: made.teams } } });
      await prisma.mentor.deleteMany({ where: { id: { in: made.mentors } } });
      await prisma.organization.deleteMany({ where: { id: { in: made.orgs } } });
      await clearMp().catch(() => {});
    } catch (e) { console.error('cleanup error:', e.message); }
    await prisma.$disconnect();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail > 0 ? 1 : 0);
  });
