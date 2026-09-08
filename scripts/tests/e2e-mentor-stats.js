/**
 * End-to-end test for the mentors page statistics.
 *
 * These three columns — الفرق المعينة / التوفر / الجلسات — used to be
 * Math.random() values fabricated in the browser and re-rolled on every fetch.
 * They are now computed server-side from real MentorAvailability and
 * MentorBooking rows. This asserts they are correct AND stable.
 *
 * Needs a running app (VERIFY_BASE_URL), its DATABASE_URL and JWT_SECRET.
 */
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const TAG = `ms${Date.now()}`;

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { if (ok) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? '  -> ' + d : ''}`); } };
const section = (s) => console.log(`\n--- ${s} ---`);
const cookie = (c) => 'token=' + jwt.sign(c, SECRET, { expiresIn: '30m' });
const HOUR = 3600_000;

async function getMentors(ck) {
  const res = await fetch(BASE + '/api/admin/mentors', { headers: { cookie: ck } });
  return { status: res.status, json: await res.json().catch(() => null) };
}
async function waitForServer() {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/api/admin/mentors')).status === 401) return; } catch {} await new Promise(r => setTimeout(r, 2000)); }
  throw new Error('server not reachable');
}

(async () => {
  if (!SECRET) throw new Error('JWT_SECRET required');
  await waitForServer();
  const admin = await prisma.admin.upsert({ where: { username: `${TAG}-adm` }, update: {}, create: { username: `${TAG}-adm`, passwordHash: 'x' } });
  const aCookie = cookie({ id: admin.id, username: admin.username, role: 'admin' });

  // --- fixtures -----------------------------------------------------------
  const teamA = await prisma.team.create({ data: { teamName: `${TAG} فريق أ`, status: 'approved' } });
  const teamB = await prisma.team.create({ data: { teamName: `${TAG} فريق ب`, status: 'approved' } });
  const pA = await prisma.participant.create({ data: { email: `${TAG}-a@t.local`, fullName: 'A', teamId: teamA.id } });
  const pB = await prisma.participant.create({ data: { email: `${TAG}-b@t.local`, fullName: 'B', teamId: teamB.id } });
  const pC = await prisma.participant.create({ data: { email: `${TAG}-c@t.local`, fullName: 'C', teamId: teamA.id } }); // same team as A
  const pSolo = await prisma.participant.create({ data: { email: `${TAG}-solo@t.local`, fullName: 'Solo' } });          // no team

  const mk = (name) => prisma.mentor.create({ data: { name: `${TAG} ${name}`, email: `${TAG}-${name}@t.local`, specialty: 's', phone: '0500000000', status: 'active' } });
  const mBusy = await mk('busy');     // all future slots booked
  const mFree = await mk('free');     // all future slots free
  const mMixed = await mk('mixed');   // some booked, some free
  const mNone = await mk('none');     // no future slots at all

  const now = Date.now();
  const slot = (mentorId, offsetH) => prisma.mentorAvailability.create({
    data: { mentorId, startTime: new Date(now + offsetH * HOUR), endTime: new Date(now + (offsetH + 1) * HOUR) },
  });
  const book = (availabilityId, participantId, status = 'booked') =>
    prisma.mentorBooking.create({ data: { availabilityId, participantId, status } });

  // mBusy: 2 future slots, both booked (teams A and B) + 1 PAST booked slot
  const b1 = await slot(mBusy.id, 5); await book(b1.id, pA.id);
  const b2 = await slot(mBusy.id, 8); await book(b2.id, pB.id);
  const bPast = await slot(mBusy.id, -10); await book(bPast.id, pC.id);   // past -> "completed"
  // mFree: 2 future slots, no bookings
  await slot(mFree.id, 3); await slot(mFree.id, 4);
  // mMixed: 1 booked (team A), 1 free, plus a CANCELLED booking that must not count
  const x1 = await slot(mMixed.id, 6); await book(x1.id, pA.id);
  const x2 = await slot(mMixed.id, 7);
  const x3 = await slot(mMixed.id, 9); await book(x3.id, pB.id, 'cancelled');
  // mNone: only a past slot
  const n1 = await slot(mNone.id, -5); await book(n1.id, pSolo.id);

  const byName = (list, n) => list.find((m) => m.name === `${TAG} ${n}`);

  section('stats are computed from real data');
  let r = await getMentors(aCookie);
  check('admin list 200', r.status === 200, String(r.status));
  const busy = byName(r.json, 'busy'), free = byName(r.json, 'free'), mixed = byName(r.json, 'mixed'), none = byName(r.json, 'none');

  check('الجلسات: past non-cancelled booking counts as completed', busy.sessionsCompleted === 1, String(busy.sessionsCompleted));
  check('الجلسات: future bookings counted separately', busy.sessionsUpcoming === 2, String(busy.sessionsUpcoming));
  check('الجلسات: total = completed + upcoming', busy.sessionsTotal === 3, String(busy.sessionsTotal));
  check('الفرق المعينة: distinct teams only (A twice + B = 2)', busy.assignedTeams === 2, String(busy.assignedTeams));
  check('team names returned for the tooltip', busy.teams.includes(`${TAG} فريق أ`) && busy.teams.includes(`${TAG} فريق ب`), JSON.stringify(busy.teams));

  section('التوفر reflects future slots');
  check('all future slots booked -> مشغول', busy.availability === 'مشغول', String(busy.availability));
  check('all future slots free -> متاح', free.availability === 'متاح', String(free.availability));
  check('some booked, some free -> متاح جزئياً', mixed.availability === 'متاح جزئياً', String(mixed.availability));
  check('no future slots -> no badge (null)', none.availability === null, String(none.availability));
  check('mentor with no bookings has 0 teams / 0 sessions', free.assignedTeams === 0 && free.sessionsTotal === 0, JSON.stringify({ t: free.assignedTeams, s: free.sessionsTotal }));

  section('cancelled bookings are ignored');
  check('cancelled booking not counted as a session', mixed.sessionsTotal === 1, String(mixed.sessionsTotal));
  check('cancelled booking does not add its team', mixed.assignedTeams === 1 && !mixed.teams.includes(`${TAG} فريق ب`), JSON.stringify(mixed.teams));
  check('a free slot whose only booking was cancelled counts as free', mixed.availableSlots === 2, String(mixed.availableSlots));

  section('participant with no team does not break the count');
  check('booking by a team-less participant adds no team', none.assignedTeams === 0 && none.sessionsCompleted === 1,
        JSON.stringify({ t: none.assignedTeams, c: none.sessionsCompleted }));

  section('values are STABLE across fetches (the old bug)');
  const snap = (list) => JSON.stringify(list.filter((m) => m.name.startsWith(TAG)).map((m) => [m.name, m.assignedTeams, m.availability, m.sessionsCompleted]).sort());
  const first = snap(r.json);
  const second = snap((await getMentors(aCookie)).json);
  const third = snap((await getMentors(aCookie)).json);
  check('three consecutive fetches return identical stats', first === second && second === third, first === second ? 'drift on 3rd' : 'drift on 2nd');
  check('no rating field is returned any more', r.json.every((m) => m.rating === undefined));

  section('participants get a REAL availability summary — and nothing private');
  const pCookie = cookie({ id: pSolo.id, participantId: pSolo.id, email: pSolo.email, role: 'participant' });
  const pr = await getMentors(pCookie);
  check('participant list 200', pr.status === 200, String(pr.status));
  const pm = byName(pr.json, 'free');
  check('participant sees the real availability (متاح, with slot count)',
    pm && pm.availability === 'متاح' && typeof pm.availableSlots === 'number',
    JSON.stringify(pm && { a: pm.availability, s: pm.availableSlots }));
  check('participant response leaks NO team/session data',
    pm && pm.assignedTeams === undefined && pm.teams === undefined &&
    pm.sessionsCompleted === undefined && pm.sessionsTotal === undefined,
    JSON.stringify(pm && Object.keys(pm)));
  check('participant still sees the mentors themselves', Boolean(pm && pm.name && pm.specialty));

  section('cleanup');
  await prisma.mentorBooking.deleteMany({ where: { participant: { email: { startsWith: TAG } } } });
  await prisma.mentorAvailability.deleteMany({ where: { mentor: { email: { startsWith: TAG } } } });
  await prisma.mentor.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.participant.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.team.deleteMany({ where: { teamName: { startsWith: TAG } } });
  await prisma.admin.delete({ where: { id: admin.id } });
  console.log('  cleaned up');

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('CRASH', e); await prisma.$disconnect(); process.exit(1); });
