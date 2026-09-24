/**
 * e2e — tracked meeting link: GET /api/meeting/join/<bookingId>
 *
 *   - participant click → participantJoinedAt; mentor click → mentorJoinedAt;
 *     first click wins (later clicks don't overwrite); both → status completed
 *     + completedAt; every allowed click 302-redirects to the Jitsi room;
 *   - teammates count as the participant; org members count as the mentor for
 *     organization bookings; admins are redirected without stamping;
 *   - strangers 403, anonymous → /login, cancelled → 410, unknown → 404;
 *   - only clicks inside the session window (10 min before start … 15 min
 *     after end) are recorded; a click outside still redirects but stamps
 *     nothing; the two sides' clicks must be within 30 min to complete.
 */
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const TAG = `join${Date.now()}`;
const HOUR = 3600_000;

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? '  -> ' + detail : ''}`); } };
const section = (s) => console.log(`\n--- ${s} ---`);
const cookie = (c) => 'token=' + jwt.sign(c, SECRET, { expiresIn: '30m' });
const pCookie = (p) => cookie({ id: p.id, participantId: p.id, role: 'participant', teamId: p.teamId });
const mCookie = (m) => cookie({ id: m.id, mentorId: m.id, role: 'mentor' });
async function join(bookingId, ck) {
  const res = await fetch(`${BASE}/api/meeting/join/${bookingId}`, { headers: ck ? { cookie: ck } : {}, redirect: 'manual' });
  return { status: res.status, location: res.headers.get('location') || '' };
}
const row = (id) => prisma.mentorBooking.findUnique({ where: { id } });

const made = { teams: [], participants: [], mentors: [], orgs: [] };
(async () => {
  if (!SECRET) throw new Error('JWT_SECRET required');
  const admin = await prisma.admin.findFirst();
  const aCookie = cookie({ id: admin.id, username: admin.username, role: 'admin' });

  const org = await prisma.organization.create({ data: { name: `${TAG} org` } }); made.orgs.push(org.id);
  const mk = async (name, extra = {}) => { const m = await prisma.mentor.create({ data: { name: `${TAG} ${name}`, email: `${TAG}-${name}@e2e.test`, specialty: 'x', phone: '05', status: 'active', ...extra } }); made.mentors.push(m.id); return m; };
  const mentor = await mk('mentor', { organizationId: org.id });
  const colleague = await mk('colleague', { organizationId: org.id });
  const outsider = await mk('outsider');
  const team = await prisma.team.create({ data: { teamName: `${TAG} team`, status: 'approved' } }); made.teams.push(team.id);
  const mkP = async (name, extra = {}) => { const p = await prisma.participant.create({ data: { email: `${TAG}-${name}@e2e.test`, fullName: name, status: 'approved', ...extra } }); made.participants.push(p.id); return p; };
  const booker = await mkP('booker', { teamId: team.id, isLeader: true });
  const mate = await mkP('mate', { teamId: team.id });
  const stranger = await mkP('stranger');
  const MIN = 60_000;
  // startMin: minutes from now to the slot start (negative = already started); 15-min slots
  const slot = async (mentorId, startMin) => prisma.mentorAvailability.create({ data: { mentorId, startTime: new Date(Date.now() + startMin * MIN), endTime: new Date(Date.now() + (startMin + 15) * MIN) } });
  const s1 = await slot(mentor.id, -2), s2 = await slot(mentor.id, -3), s3 = await slot(mentor.id, 120);
  const sFar = await slot(mentor.id, 120), sOld = await slot(mentor.id, -60), sGap = await slot(mentor.id, -20), sNear = await slot(mentor.id, 8);
  const b1 = await prisma.mentorBooking.create({ data: { participantId: booker.id, availabilityId: s1.id, status: 'booked', meetingUrl: 'https://meet.jit.si/Mayda-Test1' } });
  const bOrg = await prisma.mentorBooking.create({ data: { participantId: booker.id, availabilityId: s2.id, status: 'booked', meetingUrl: 'https://meet.jit.si/Mayda-Test2', organizationId: org.id } });
  const bCancelled = await prisma.mentorBooking.create({ data: { participantId: booker.id, availabilityId: s3.id, status: 'cancelled', meetingUrl: 'https://meet.jit.si/Mayda-Test3' } });
  const bFar = await prisma.mentorBooking.create({ data: { participantId: booker.id, availabilityId: sFar.id, status: 'booked', meetingUrl: 'https://meet.jit.si/Mayda-Far' } });
  const bOld = await prisma.mentorBooking.create({ data: { participantId: booker.id, availabilityId: sOld.id, status: 'booked', meetingUrl: 'https://meet.jit.si/Mayda-Old' } });
  // mentor "joined" 45 minutes ago on a slot that started 20 min ago (window still open until +10 min)
  const bGap = await prisma.mentorBooking.create({ data: { participantId: booker.id, availabilityId: sGap.id, status: 'booked', meetingUrl: 'https://meet.jit.si/Mayda-Gap', mentorJoinedAt: new Date(Date.now() - 45 * MIN) } });
  const bNear = await prisma.mentorBooking.create({ data: { participantId: booker.id, availabilityId: sNear.id, status: 'booked', meetingUrl: 'https://meet.jit.si/Mayda-Near' } });

  section('access rules');
  let r = await join(b1.id, null);
  check('anonymous -> redirect to /login', (r.status === 302 || r.status === 307) && /\/login$/.test(r.location), `status=${r.status} loc=${r.location}`);
  check('stranger participant -> 403', (await join(b1.id, pCookie(stranger))).status === 403);
  check('unrelated mentor -> 403', (await join(b1.id, mCookie(outsider))).status === 403);
  check('unknown booking -> 404', (await join('nope', pCookie(booker))).status === 404);
  check('cancelled booking -> 410', (await join(bCancelled.id, pCookie(booker))).status === 410);
  r = await join(b1.id, aCookie);
  check('admin -> 302 to the room, nothing stamped', r.status === 302 && r.location === 'https://meet.jit.si/Mayda-Test1' && (await row(b1.id)).mentorJoinedAt === null && (await row(b1.id)).participantJoinedAt === null, `status=${r.status}`);

  section('participant then mentor → completed');
  r = await join(b1.id, pCookie(booker));
  let b = await row(b1.id);
  check('participant click -> 302 to room + participantJoinedAt set, still booked', r.status === 302 && r.location === 'https://meet.jit.si/Mayda-Test1' && !!b.participantJoinedAt && b.mentorJoinedAt === null && b.status === 'booked', JSON.stringify({ s: r.status, p: !!b.participantJoinedAt }));
  const firstClick = b.participantJoinedAt;
  await new Promise((res) => setTimeout(res, 1100));
  await join(b1.id, pCookie(mate));
  b = await row(b1.id);
  check('  teammate click later does NOT overwrite the first timestamp', b.participantJoinedAt.getTime() === firstClick.getTime());
  r = await join(b1.id, mCookie(mentor));
  b = await row(b1.id);
  check('mentor (slot owner) click -> mentorJoinedAt set AND booking completed', r.status === 302 && !!b.mentorJoinedAt && b.status === 'completed' && !!b.completedAt, JSON.stringify({ status: b.status, m: !!b.mentorJoinedAt, c: !!b.completedAt }));
  const completedAt = b.completedAt;
  await join(b1.id, mCookie(mentor)); await join(b1.id, pCookie(booker));
  b = await row(b1.id);
  check('  further clicks keep the same timestamps/status', b.completedAt.getTime() === completedAt.getTime() && b.status === 'completed');

  section('organization booking: any org member counts as the mentor; teammate as the participant');
  check('outsider mentor still 403 on the org booking', (await join(bOrg.id, mCookie(outsider))).status === 403);
  r = await join(bOrg.id, mCookie(colleague));
  b = await row(bOrg.id);
  check('colleague click -> mentorJoinedAt set (booking still open)', r.status === 302 && !!b.mentorJoinedAt && b.status === 'booked');
  r = await join(bOrg.id, pCookie(mate));
  b = await row(bOrg.id);
  check('teammate click -> participantJoinedAt set and booking completed', r.status === 302 && !!b.participantJoinedAt && b.status === 'completed');

  section('session window: clicks outside it redirect but do not count');
  r = await join(bFar.id, pCookie(booker));
  b = await row(bFar.id);
  check('2 hours before the slot: 302 to the room, nothing stamped', r.status === 302 && r.location === 'https://meet.jit.si/Mayda-Far' && b.participantJoinedAt === null && b.status === 'booked', `status=${r.status}`);
  r = await join(bOld.id, mCookie(mentor));
  b = await row(bOld.id);
  check('45 min after the slot ended: 302, nothing stamped', r.status === 302 && b.mentorJoinedAt === null, `status=${r.status}`);
  r = await join(bNear.id, pCookie(booker));
  b = await row(bNear.id);
  check('8 minutes before the start (inside the 10-min lead): stamped', r.status === 302 && !!b.participantJoinedAt);

  section('gap rule: both joined but 45 minutes apart -> not completed');
  r = await join(bGap.id, pCookie(booker));
  b = await row(bGap.id);
  check('participant stamped, booking stays booked (mentor joined 45 min earlier)', r.status === 302 && !!b.participantJoinedAt && !!b.mentorJoinedAt && b.status === 'booked' && b.completedAt === null, JSON.stringify({ s: b.status }));

  section('dashboards reflect it');
  const mine = await (await fetch(`${BASE}/api/participant/my-bookings`, { headers: { cookie: pCookie(booker) } })).json();
  check("my-bookings shows the booking as completed", Array.isArray(mine) && mine.some((x) => x.id === b1.id && x.status === 'completed'));
  const mb = await (await fetch(`${BASE}/api/mentor/bookings`, { headers: { cookie: mCookie(mentor) } })).json();
  check('mentor bookings shows completed for both sessions', Array.isArray(mb) && [b1.id, bOrg.id].every((id) => mb.find((x) => x.id === id)?.status === 'completed'));
})()
  .catch((e) => { fail++; console.error('\nSCRIPT ERROR:', e.stack); })
  .finally(async () => {
    try {
      await prisma.mentorBooking.deleteMany({ where: { participantId: { in: made.participants } } });
      await prisma.mentorAvailability.deleteMany({ where: { mentorId: { in: made.mentors } } });
      await prisma.notification.deleteMany({ where: { recipientId: { in: [...made.participants, ...made.mentors] } } });
      await prisma.participant.deleteMany({ where: { id: { in: made.participants } } });
      await prisma.team.deleteMany({ where: { id: { in: made.teams } } });
      await prisma.mentor.deleteMany({ where: { id: { in: made.mentors } } });
      await prisma.organization.deleteMany({ where: { id: { in: made.orgs } } });
    } catch (e) { console.error('cleanup error:', e.message); }
    await prisma.$disconnect();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail > 0 ? 1 : 0);
  });
