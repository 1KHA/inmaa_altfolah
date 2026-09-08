/**
 * E2E suite for per-booking video meeting links (2026-09):
 *
 *  - every booking gets its own unguessable Jitsi room URL, stored on the row
 *  - the confirmation goes to the WHOLE team of the booker (individuals get it
 *    directly), the mentor gets the link too
 *  - with email enabled, the link lands in the emails (mentor's includes the
 *    Google sign-in note for the meet.jit.si moderator policy)
 *  - my-bookings / mentor bookings / admin bookings all expose meetingUrl;
 *    another participant probing the slot gets no link
 *
 * Same harness as sibling suites; restores EmailSettings, cleans EmailLog +
 * Mailpit + fixtures.
 */
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const TAG = `ml${Date.now()}`;
const URL_RE = /^https:\/\/meet\.jit\.si\/Miyahthone-[A-Za-z0-9_-]{12}$/;

let pass = 0, fail = 0;
const made = { participants: [], teams: [], mentors: [] };

const check = (n, ok, d = '') => { if (ok) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? '  -> ' + d : ''}`); } };
const section = (s) => console.log(`\n--- ${s} ---`);
const cookie = (c) => 'token=' + jwt.sign(c, SECRET, { expiresIn: '30m' });
const pCookie = (id) => cookie({ id, participantId: id, role: 'participant' });
const HOUR = 3600_000;

async function api(pathname, { cookie: ck, method = 'GET', body } = {}) {
  const res = await fetch(BASE + pathname, {
    method,
    headers: { ...(ck ? { cookie: ck } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

const MAILPIT = 'http://localhost:8025';
const mp = async (p) => (await fetch(MAILPIT + p)).json();
const clearMp = async () => { await fetch(MAILPIT + '/api/v1/messages', { method: 'DELETE' }); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function inboxFor(addr) {
  const data = await mp('/api/v1/messages?limit=200');
  return (data.messages || []).filter(
    (m) => (m.To || []).some((t) => t.Address === addr) || (m.Bcc || []).some((t) => t.Address === addr)
  );
}

const mkMentor = async (n) => {
  const m = await prisma.mentor.create({ data: { name: `${TAG} مرشد ${n}`, email: `${TAG}-mentor${n}@t.test`, specialty: 'اختبار', phone: '05', status: 'active' } });
  made.mentors.push(m.id); return m;
};
const mkSlot = (mentorId, h) => prisma.mentorAvailability.create({
  data: { mentorId, startTime: new Date(Date.now() + h * HOUR), endTime: new Date(Date.now() + (h + 0.25) * HOUR) },
});

async function main() {
  const admin = (await prisma.admin.findMany())[0];
  if (!admin) { check('an admin row exists (seed first)', false); return; }
  const aCookie = cookie({ id: admin.id, username: admin.username, role: 'admin' });

  const team = await prisma.team.create({ data: { teamName: `${TAG} فريق`, status: 'approved' } });
  made.teams.push(team.id);
  const leader = await prisma.participant.create({ data: { fullName: `${TAG} قائد`, email: `${TAG}-leader@t.test`, status: 'approved', teamId: team.id, isLeader: true } });
  const mate = await prisma.participant.create({ data: { fullName: `${TAG} زميل`, email: `${TAG}-mate@t.test`, status: 'approved', teamId: team.id } });
  const solo = await prisma.participant.create({ data: { fullName: `${TAG} فردي`, email: `${TAG}-solo@t.test`, status: 'approved' } });
  made.participants.push(leader.id, mate.id, solo.id);

  const mentorA = await mkMentor('أ');
  const mentorB = await mkMentor('ب');
  const slotA = await mkSlot(mentorA.id, 24);
  const slotB = await mkSlot(mentorB.id, 24);

  // ============ link generation ============
  section('every booking gets its own unguessable room');
  const b1 = await api('/api/participant/book-appointment', { method: 'POST', cookie: pCookie(leader.id), body: { availabilityId: slotA.id } });
  check('team leader booking succeeds', b1.status === 201, `status=${b1.status} ${JSON.stringify(b1.json)}`);
  const url1 = b1.json?.booking?.meetingUrl;
  check('  response carries a well-formed Jitsi URL', URL_RE.test(url1 || ''), url1);

  const b2 = await api('/api/participant/book-appointment', { method: 'POST', cookie: pCookie(solo.id), body: { availabilityId: slotB.id } });
  check('individual booking succeeds', b2.status === 201, `status=${b2.status}`);
  const url2 = b2.json?.booking?.meetingUrl;
  check('  also a well-formed URL', URL_RE.test(url2 || ''), url2);
  check('  the two rooms are DIFFERENT', !!url1 && !!url2 && url1 !== url2);

  const row1 = await prisma.mentorBooking.findFirst({ where: { availabilityId: slotA.id } });
  check('  URL persisted on the booking row', row1?.meetingUrl === url1);

  // ============ team-wide dashboard fan-out ============
  section('confirmation reaches the whole team; individual reaches only themself');
  const forBooking = (id) => prisma.notification.findMany({ where: { relatedEntityType: 'booking', relatedEntityId: id, recipientType: 'participant' } });
  const teamNotifs = await forBooking(b1.json.booking.id);
  const teamRecipients = new Set(teamNotifs.map((n) => n.recipientId));
  check('both team members got the confirmation', teamRecipients.has(leader.id) && teamRecipients.has(mate.id), `recipients=${teamRecipients.size}`);
  const soloNotifs = await forBooking(b2.json.booking.id);
  check('individual booking notifies exactly the booker', soloNotifs.length === 1 && soloNotifs[0].recipientId === solo.id, `count=${soloNotifs.length}`);
  const mentorNotif = await prisma.notification.findFirst({ where: { relatedEntityType: 'booking', relatedEntityId: b1.json.booking.id, recipientType: 'mentor', recipientId: mentorA.id } });
  check('mentor got the booking notification', !!mentorNotif);

  // ============ emails carry the link (Mailpit) ============
  section('emails carry the meeting link');
  const settingsRow = await prisma.emailSettings.findFirst();
  const originalSettings = { ...settingsRow };
  await prisma.emailSettings.update({
    where: { id: settingsRow.id },
    data: { host: 'localhost', port: 1025, secure: false, username: '', password: '', fromEmail: 'noreply@example.test', fromName: 'منصة دِيَم', adminInboxEmail: '', enabled: true },
  });
  await clearMp();

  const mentorC = await mkMentor('ج');
  const slotC = await mkSlot(mentorC.id, 30);
  const b3 = await api('/api/participant/book-appointment', { method: 'POST', cookie: pCookie(mate.id), body: { availabilityId: slotC.id } });
  check('booking with email enabled succeeds', b3.status === 201, `status=${b3.status} ${JSON.stringify(b3.json)}`);
  const url3 = b3.json?.booking?.meetingUrl;
  await wait(900);

  const leaderMail = await inboxFor(leader.email);
  const mateMail = await inboxFor(mate.email);
  check('BOTH team members received the confirmation email', leaderMail.length === 1 && mateMail.length === 1, `leader=${leaderMail.length} mate=${mateMail.length}`);
  if (mateMail[0]) {
    const full = await mp(`/api/v1/message/${mateMail[0].ID}`);
    const text = (full.Text || '') + (full.HTML || '');
    check('  participant email contains the meeting link', text.includes(url3), url3);
  } else check('  participant email contains the meeting link', false, 'no mail');

  const mentorMail = await inboxFor(mentorC.email);
  check('mentor received the booking email', mentorMail.length === 1, `count=${mentorMail.length}`);
  if (mentorMail[0]) {
    const full = await mp(`/api/v1/message/${mentorMail[0].ID}`);
    const text = (full.Text || '') + (full.HTML || '');
    check('  mentor email contains the meeting link', text.includes(url3));
    check('  mentor email explains the Google sign-in (moderator) step', text.includes('Google'));
  } else { check('  mentor email contains the meeting link', false); check('  mentor email explains the Google sign-in (moderator) step', false); }

  // restore settings before the read-API section
  const { id: _i, updatedAt: _u, ...restore } = originalSettings;
  await prisma.emailSettings.update({ where: { id: settingsRow.id }, data: restore });

  // ============ read APIs ============
  section('link is visible exactly where it should be');
  const mine = await api('/api/participant/my-bookings', { cookie: pCookie(leader.id) });
  check('my-bookings exposes meetingUrl', mine.status === 200 && mine.json?.[0]?.meetingUrl === url1, JSON.stringify(mine.json?.[0]?.meetingUrl));

  const mBookings = await api('/api/mentor/bookings', { cookie: cookie({ id: mentorA.id, mentorId: mentorA.id, role: 'mentor' }) });
  check('mentor sees the link on their session', mBookings.status === 200 && mBookings.json?.some((b) => b.meetingUrl === url1), `status=${mBookings.status}`);

  const adminBookings = await api('/api/admin/mentor-bookings', { cookie: aCookie });
  check('admin bookings table exposes the link', adminBookings.status === 200 && adminBookings.json?.some((b) => b.meetingUrl === url1), `status=${adminBookings.status}`);

  const probe = await api(`/api/participant/book-appointment?availabilityId=${slotA.id}`, { cookie: pCookie(solo.id) });
  check('another participant probing the slot gets NO link', probe.status === 200 && probe.json?.isBooked === true && probe.json?.booking === null, JSON.stringify(probe.json));
  const own = await api(`/api/participant/book-appointment?availabilityId=${slotA.id}`, { cookie: pCookie(leader.id) });
  check('the booker probing their own slot DOES get the link', own.json?.booking?.meetingUrl === url1);
}

main()
  .catch((e) => { fail++; console.error('SUITE ERROR:', e); })
  .finally(async () => {
    try {
      await prisma.notification.deleteMany({ where: { OR: [{ recipientId: { in: [...made.participants, ...made.mentors] } }, { title: { startsWith: TAG } }] } });
      await prisma.emailLog.deleteMany({ where: { templateKey: { in: ['bookingConfirmation', 'newBookingRequest'] } } });
      await clearMp().catch(() => {});
      await prisma.mentorBooking.deleteMany({ where: { participantId: { in: made.participants } } });
      await prisma.mentorAvailability.deleteMany({ where: { mentorId: { in: made.mentors } } });
      await prisma.mentor.deleteMany({ where: { id: { in: made.mentors } } });
      await prisma.participant.deleteMany({ where: { id: { in: made.participants } } });
      await prisma.team.deleteMany({ where: { id: { in: made.teams } } });
    } catch (e) { console.error('cleanup error:', e.message); }
    await prisma.$disconnect();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail > 0 ? 1 : 0);
  });
