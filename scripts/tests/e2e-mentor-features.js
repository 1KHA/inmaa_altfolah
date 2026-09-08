/**
 * E2E suite for the mentor-page feature batch (2026-09):
 *
 *  1. one active booking per mentor per participant (multiple mentors OK,
 *     cancelled bookings do not block a re-book)
 *  2. GET /api/mentor/bookings is admin/self-mentor only — participants are
 *     locked out (the participant-facing "الحجوزات" viewer was removed)
 *  3. creating an event notifies every participant (dashboard rows), like
 *     newMilestoneAvailable
 *  4. admin custom message to a mentor + their booked participants via the
 *     broadcast pipeline (the admin mentors-page dialog posts exactly this)
 *
 * Same harness as the sibling suites: real HTTP against a running server,
 * assertions via Prisma, fixtures deleted in `finally`.
 */
const path = require('path');
const REPO = '/Users/kha/Documents/Code/dyam_hackathon/dhwmk_alvira';
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const TAG = `e2emf${Date.now()}`;

let pass = 0, fail = 0;
const made = { participants: [], mentors: [], availabilities: [], events: [], broadcasts: [] };

function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  -> ' + detail : ''}`); }
}
const section = (s) => console.log(`\n--- ${s} ---`);

const cookie = (c) => 'token=' + jwt.sign(c, SECRET, { expiresIn: '30m' });
const partCookie = (id) => cookie({ id, participantId: id, role: 'participant' });
const mentorCookie = (id) => cookie({ id, mentorId: id, role: 'mentor' });

async function api(pathname, { cookie: ck, method = 'GET', body } = {}) {
  const res = await fetch(BASE + pathname, {
    method,
    headers: { ...(ck ? { cookie: ck } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

const mkMentor = async (n) => {
  const m = await prisma.mentor.create({
    data: { name: `${TAG} مرشد ${n}`, email: `${TAG}-mentor${n}@example.invalid`, specialty: 'اختبار', phone: '0500000009', status: 'active' },
  });
  made.mentors.push(m.id);
  return m;
};
const mkAvail = async (mentorId, hoursFromNow) => {
  const a = await prisma.mentorAvailability.create({
    data: {
      mentorId,
      startTime: new Date(Date.now() + hoursFromNow * 3600e3),
      endTime: new Date(Date.now() + (hoursFromNow + 0.25) * 3600e3), // 15-min slot
    },
  });
  made.availabilities.push(a.id);
  return a;
};

async function main() {
  const admin = (await prisma.admin.findMany({ select: { id: true, username: true } }))[0];
  if (!admin) { check('an admin row exists (seed the DB first)', false); return; }
  const aCookie = cookie({ id: admin.id, username: admin.username, role: 'admin' });

  const p1 = await prisma.participant.create({
    data: { fullName: `${TAG} مشارك ١`, email: `${TAG}-p1@example.invalid`, status: 'approved', contactNumber: '0500000001' },
  });
  const p2 = await prisma.participant.create({
    data: { fullName: `${TAG} مشارك ٢`, email: `${TAG}-p2@example.invalid`, status: 'approved', contactNumber: '0500000002' },
  });
  made.participants.push(p1.id, p2.id);

  const mentorA = await mkMentor('أ');
  const mentorB = await mkMentor('ب');
  const a1 = await mkAvail(mentorA.id, 24);
  const a2 = await mkAvail(mentorA.id, 25);
  const a3 = await mkAvail(mentorA.id, 26);
  const b1 = await mkAvail(mentorB.id, 24);

  // ============ 1) one active booking per mentor ============
  section('one active booking per mentor per participant');

  const first = await api('/api/participant/book-appointment', {
    method: 'POST', cookie: partCookie(p1.id), body: { availabilityId: a1.id },
  });
  check('first booking with mentor A succeeds', first.status === 201, `status=${first.status} ${JSON.stringify(first.json)}`);

  const second = await api('/api/participant/book-appointment', {
    method: 'POST', cookie: partCookie(p1.id), body: { availabilityId: a2.id },
  });
  check('second slot with the SAME mentor is rejected (400)', second.status === 400, `status=${second.status}`);
  check('  rejection message says one session per mentor',
    !!second.json?.message && second.json.message.includes('جلسة واحدة'), JSON.stringify(second.json));

  const otherMentor = await api('/api/participant/book-appointment', {
    method: 'POST', cookie: partCookie(p1.id), body: { availabilityId: b1.id },
  });
  check('booking a DIFFERENT mentor still succeeds', otherMentor.status === 201, `status=${otherMentor.status} ${JSON.stringify(otherMentor.json)}`);

  const otherParticipant = await api('/api/participant/book-appointment', {
    method: 'POST', cookie: partCookie(p2.id), body: { availabilityId: a2.id },
  });
  check('another participant can book mentor A', otherParticipant.status === 201, `status=${otherParticipant.status}`);

  // cancelled bookings do not block a re-book
  await prisma.mentorBooking.updateMany({
    where: { participantId: p1.id, availability: { mentorId: mentorA.id } },
    data: { status: 'cancelled' },
  });
  const rebook = await api('/api/participant/book-appointment', {
    method: 'POST', cookie: partCookie(p1.id), body: { availabilityId: a3.id },
  });
  check('after cancellation, booking mentor A again succeeds', rebook.status === 201, `status=${rebook.status} ${JSON.stringify(rebook.json)}`);

  // ============ 2) /api/mentor/bookings access control ============
  section('mentor bookings endpoint lockdown');

  const asParticipant = await api(`/api/mentor/bookings?mentorId=${mentorA.id}`, { cookie: partCookie(p1.id) });
  check('participant with ?mentorId= gets 403', asParticipant.status === 403, `status=${asParticipant.status}`);

  const asParticipantNoParam = await api('/api/mentor/bookings', { cookie: partCookie(p1.id) });
  check('participant without param gets 403', asParticipantNoParam.status === 403, `status=${asParticipantNoParam.status}`);

  const noAuth = await api(`/api/mentor/bookings?mentorId=${mentorA.id}`);
  check('anonymous request gets 401', noAuth.status === 401, `status=${noAuth.status}`);

  const asOtherMentor = await api(`/api/mentor/bookings?mentorId=${mentorA.id}`, { cookie: mentorCookie(mentorB.id) });
  check('mentor B asking for mentor A gets 403', asOtherMentor.status === 403, `status=${asOtherMentor.status}`);

  const asSelf = await api('/api/mentor/bookings', { cookie: mentorCookie(mentorA.id) });
  check('mentor reads own bookings (200)', asSelf.status === 200 && Array.isArray(asSelf.json), `status=${asSelf.status}`);
  check('  own list contains the participant bookings',
    Array.isArray(asSelf.json) && asSelf.json.some((b) => b.participant?.id === p2.id), `len=${asSelf.json?.length}`);

  const asSelfWithParam = await api(`/api/mentor/bookings?mentorId=${mentorA.id}`, { cookie: mentorCookie(mentorA.id) });
  check('mentor may pass their OWN id as param (200)', asSelfWithParam.status === 200, `status=${asSelfWithParam.status}`);

  const asAdmin = await api(`/api/mentor/bookings?mentorId=${mentorA.id}`, { cookie: aCookie });
  check('admin with ?mentorId= gets 200', asAdmin.status === 200 && Array.isArray(asAdmin.json), `status=${asAdmin.status}`);

  // ============ 3) event creation notifies all participants ============
  section('event creation -> notifications for every participant');

  const preP1 = await prisma.notification.count({ where: { recipientType: 'participant', recipientId: p1.id } });
  const preP2 = await prisma.notification.count({ where: { recipientType: 'participant', recipientId: p2.id } });
  const totalParticipants = await prisma.participant.count();

  const ev = await api('/api/admin/events', {
    method: 'POST', cookie: aCookie,
    body: {
      title: `${TAG} فعالية`, description: 'وصف الفعالية', location: 'الرياض',
      startDate: new Date(Date.now() + 48 * 3600e3).toISOString(),
      endDate: new Date(Date.now() + 50 * 3600e3).toISOString(),
      capacity: 100, type: 'ورشة', plan: 'الخطة', presenter: 'مقدم',
    },
  });
  check('POST /api/admin/events succeeds', ev.status === 201, `status=${ev.status} ${JSON.stringify(ev.json)}`);
  if (ev.json?.id) made.events.push(ev.json.id);

  const evNotifs = await prisma.notification.findMany({
    where: { relatedEntityType: 'event', relatedEntityId: ev.json?.id ?? '-' },
  });
  check('one notification per participant was created', evNotifs.length === totalParticipants,
    `rows=${evNotifs.length} participants=${totalParticipants}`);

  const p1After = await prisma.notification.count({ where: { recipientType: 'participant', recipientId: p1.id } });
  const p2After = await prisma.notification.count({ where: { recipientType: 'participant', recipientId: p2.id } });
  check('fixture participants each got exactly one', p1After === preP1 + 1 && p2After === preP2 + 1,
    `p1 ${preP1}->${p1After}, p2 ${preP2}->${p2After}`);
  const sample = evNotifs.find((n) => n.recipientId === p1.id);
  check('  notification names the event', !!sample && sample.message.includes(`${TAG} فعالية`), sample?.message);
  check('  actionUrl points to the participant events page',
    !!sample && sample.actionUrl === '/participant-dashboard/events', sample?.actionUrl);

  // invalid event (past date) must NOT notify anyone
  const preBad = await prisma.notification.count({ where: { recipientType: 'participant' } });
  const bad = await api('/api/admin/events', {
    method: 'POST', cookie: aCookie,
    body: {
      title: `${TAG} ماضية`, description: 'x', location: 'x',
      startDate: new Date(Date.now() - 48 * 3600e3).toISOString(),
      endDate: new Date(Date.now() - 40 * 3600e3).toISOString(),
      capacity: 10, type: 'x', plan: 'x', presenter: 'x',
    },
  });
  const postBad = await prisma.notification.count({ where: { recipientType: 'participant' } });
  check('rejected event (past date) creates no notifications', bad.status === 400 && postBad === preBad,
    `status=${bad.status} ${preBad}->${postBad}`);

  // ============ 4) admin message to mentor + booked participants ============
  section('admin broadcast to mentor + booked participants');

  // what the MentorMessageDialog sends: mentor A + the participants with an
  // active booking (p2 booked; p1 active again after the re-book above)
  const link = 'https://meet.example.invalid/xyz';
  const bc = await api('/api/admin/broadcast', {
    method: 'POST', cookie: aCookie,
    body: {
      title: `${TAG} رابط الجلسة`,
      body: `تفاصيل الجلسة\n\nرابط الاجتماع: ${link}`,
      emailSubject: `${TAG} رابط الجلسة`,
      channels: ['dashboard'],
      audience: {
        type: 'selected',
        selected: [
          { type: 'mentor', id: mentorA.id },
          { type: 'participant', id: p1.id },
          { type: 'participant', id: p2.id },
        ],
      },
    },
  });
  check('POST /api/admin/broadcast succeeds', bc.status === 200 && bc.json?.success === true,
    `status=${bc.status} ${JSON.stringify(bc.json)}`);
  if (bc.json?.broadcast?.id) made.broadcasts.push(bc.json.broadcast.id);
  check('  3 dashboard notifications reported', bc.json?.broadcast?.notificationCount === 3,
    `count=${bc.json?.broadcast?.notificationCount}`);

  const mentorMsg = await prisma.notification.findFirst({
    where: { recipientType: 'mentor', recipientId: mentorA.id, title: `${TAG} رابط الجلسة` },
  });
  const partMsg = await prisma.notification.findFirst({
    where: { recipientType: 'participant', recipientId: p2.id, title: `${TAG} رابط الجلسة` },
  });
  check('mentor got the dashboard message', !!mentorMsg);
  check('booked participant got the dashboard message', !!partMsg);
  check('  message carries the meeting link', !!partMsg && partMsg.message.includes(link), partMsg?.message);

  // mentor sees it through the bell API
  const bell = await api('/api/notifications?limit=20', { cookie: mentorCookie(mentorA.id) });
  check('mentor bell lists the custom message',
    bell.status === 200 && bell.json?.notifications?.some((n) => n.title === `${TAG} رابط الجلسة`),
    `status=${bell.status}`);
}

main()
  .catch((e) => { fail++; console.error('SUITE ERROR:', e); })
  .finally(async () => {
    try {
      await prisma.notification.deleteMany({ where: { OR: [
        { recipientId: { in: made.participants } },
        { recipientId: { in: made.mentors } },
        { relatedEntityId: { in: [...made.events, ...made.broadcasts] } },
        { title: { startsWith: TAG } },
      ] } });
      await prisma.broadcastRecipient.deleteMany({ where: { broadcastId: { in: made.broadcasts } } });
      await prisma.broadcast.deleteMany({ where: { id: { in: made.broadcasts } } });
      await prisma.mentorBooking.deleteMany({ where: { availabilityId: { in: made.availabilities } } });
      await prisma.mentorAvailability.deleteMany({ where: { id: { in: made.availabilities } } });
      await prisma.mentor.deleteMany({ where: { id: { in: made.mentors } } });
      await prisma.participant.deleteMany({ where: { id: { in: made.participants } } });
      for (const id of made.events) await prisma.$executeRaw`DELETE FROM "Event" WHERE id = ${id}`;
    } catch (e) {
      console.error('cleanup error:', e.message);
    }
    await prisma.$disconnect();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail > 0 ? 1 : 0);
  });
