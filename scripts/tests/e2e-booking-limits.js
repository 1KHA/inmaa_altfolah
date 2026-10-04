/**
 * e2e — configurable per-participant booking limit + cancellations that free it.
 *
 *   - default limit 3: a participant books the same mentor 3×, the 4th is refused
 *     with the limit in the message; another participant is unaffected;
 *   - admin sets the limit (validation 1..20) — a lower limit applies immediately;
 *   - cancel paths free the count AND notify the participant + team (dashboard +
 *     email) and the mentor: admin PATCH status=cancelled, admin DELETE booking,
 *     admin deletes a booked slot, mentor deletes their own booked slot (mentor
 *     path notifies the participant only);
 *   - "reset all counts" stamps bookingCountResetAt: existing bookings stop
 *     counting, nothing is cancelled, everyone can book again;
 *   - organization limit behaves the same.
 */
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const MAILPIT = process.env.MAILPIT_URL || 'http://localhost:8025';
const TAG = `lim${Date.now()}`;
const HOUR = 3600_000;

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? '  -> ' + detail : ''}`); } };
const section = (s) => console.log(`\n--- ${s} ---`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cookie = (c) => 'token=' + jwt.sign(c, SECRET, { expiresIn: '30m' });
const pCookie = (p) => cookie({ id: p.id, participantId: p.id, role: 'participant', teamId: p.teamId });
const mCookie = (m) => cookie({ id: m.id, mentorId: m.id, role: 'mentor' });
async function api(pathname, { cookie: ck, method = 'GET', body } = {}) {
  const res = await fetch(BASE + pathname, { method, headers: { ...(ck ? { cookie: ck } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
const mp = async (p) => (await fetch(MAILPIT + p)).json();
const clearMp = () => fetch(MAILPIT + '/api/v1/messages', { method: 'DELETE' });
async function mailFor(addr) {
  const data = await mp('/api/v1/messages?limit=200');
  return (data.messages || []).filter((m) => (m.To || []).some((t) => t.Address === addr) || (m.Bcc || []).some((t) => t.Address === addr));
}
const book = (p, availabilityId, organizationId) => api('/api/participant/book-appointment', { method: 'POST', cookie: pCookie(p), body: { availabilityId, ...(organizationId ? { organizationId } : {}) } });
const notifs = (recipientId, bookingId) => prisma.notification.findMany({ where: { recipientId, relatedEntityId: bookingId } });

const made = { teams: [], participants: [], mentors: [], orgs: [] };
let savedSettings = null, settingsId = null, savedEmail = null;
(async () => {
  if (!SECRET) throw new Error('JWT_SECRET required');
  const admin = await prisma.admin.findFirst();
  const aCookie = cookie({ id: admin.id, username: admin.username, role: 'admin' });
  const ts = await prisma.teamSettings.findFirst();
  settingsId = ts?.id; savedSettings = ts ? { maxBookingsPerMentor: ts.maxBookingsPerMentor, bookingCountResetAt: ts.bookingCountResetAt, mentorBookingMode: ts.mentorBookingMode } : null;
  const es = await prisma.emailSettings.findFirst();
  savedEmail = { id: es.id, data: { ...es } }; delete savedEmail.data.id; delete savedEmail.data.updatedAt;
  await prisma.emailSettings.update({ where: { id: es.id }, data: { enabled: true, host: 'localhost', port: Number(process.env.MAILPIT_SMTP_PORT || 1025), secure: false, username: '', password: '', fromEmail: 'noreply@example.test', fromName: 'E2E', adminInboxEmail: '' } });
  await clearMp();
  // Start from the defaults: limit 3, no reset mark, individual mode
  await api('/api/admin/team-settings', { method: 'PUT', cookie: aCookie, body: { maxBookingsPerMentor: 3, mentorBookingMode: 'both' } });
  await prisma.teamSettings.updateMany({ data: { bookingCountResetAt: null } });

  const mkM = async (n, extra = {}) => { const m = await prisma.mentor.create({ data: { name: `${TAG} ${n}`, email: `${TAG}-${n}@e2e.test`, specialty: 'x', phone: '05', status: 'active', ...extra } }); made.mentors.push(m.id); return m; };
  const mentor = await mkM('mentor'), other = await mkM('other');
  const org = await prisma.organization.create({ data: { name: `${TAG} org` } }); made.orgs.push(org.id);
  const orgM = await mkM('orgM', { organizationId: org.id });
  const team = await prisma.team.create({ data: { teamName: `${TAG} team`, status: 'approved' } }); made.teams.push(team.id);
  const mkP = async (n, extra = {}) => { const p = await prisma.participant.create({ data: { email: `${TAG}-${n}@e2e.test`, fullName: `${TAG} ${n}`, status: 'approved', ...extra } }); made.participants.push(p.id); return p; };
  const leader = await mkP('leader', { teamId: team.id, isLeader: true }), mate = await mkP('mate', { teamId: team.id }), solo = await mkP('solo');
  let h = 24;
  const slot = (mentorId) => prisma.mentorAvailability.create({ data: { mentorId, startTime: new Date(Date.now() + (h += 1) * HOUR), endTime: new Date(Date.now() + h * HOUR + 15 * 60_000) } });
  const s = []; for (let i = 0; i < 8; i++) s.push(await slot(mentor.id));
  const so = await slot(other.id);
  const og = []; for (let i = 0; i < 5; i++) og.push(await slot(orgM.id));

  section('settings: default 3, validation');
  let r = await api('/api/admin/team-settings', { cookie: aCookie });
  check('GET exposes maxBookingsPerMentor=3', r.json?.maxBookingsPerMentor === 3, JSON.stringify(r.json?.maxBookingsPerMentor));
  check('PUT 0 -> 400', (await api('/api/admin/team-settings', { method: 'PUT', cookie: aCookie, body: { maxBookingsPerMentor: 0 } })).status === 400);
  check('PUT 21 -> 400', (await api('/api/admin/team-settings', { method: 'PUT', cookie: aCookie, body: { maxBookingsPerMentor: 21 } })).status === 400);
  check('PUT "abc" -> 400', (await api('/api/admin/team-settings', { method: 'PUT', cookie: aCookie, body: { maxBookingsPerMentor: 'abc' } })).status === 400);
  check('non-admin cannot change it', (await api('/api/admin/team-settings', { method: 'PUT', cookie: pCookie(leader), body: { maxBookingsPerMentor: 9 } })).status !== 200);

  section('limit 3 per participant per mentor');
  const b1 = await book(leader, s[0].id), b2 = await book(leader, s[1].id), b3 = await book(leader, s[2].id);
  check('bookings 1-3 with the same mentor succeed', [b1, b2, b3].every((x) => x.status === 201), [b1, b2, b3].map((x) => x.status).join(','));
  const b4 = await book(leader, s[3].id);
  check('4th with the same mentor -> 400 with limit=3 used=3', b4.status === 400 && b4.json?.limit === 3 && b4.json?.used === 3 && /الحد الأقصى/.test(b4.json?.message || ''), JSON.stringify(b4.json));
  check('  teammate is counted separately (their 1st booking with the mentor succeeds)', (await book(mate, s[3].id)).status === 201);
  check('  another mentor still bookable', (await book(leader, so.id)).status === 201);

  section('admin lowers the limit to 2 — applies immediately');
  await api('/api/admin/team-settings', { method: 'PUT', cookie: aCookie, body: { maxBookingsPerMentor: 2 } });
  check('solo: 2 bookings ok, 3rd refused with limit=2', (await book(solo, s[4].id)).status === 201 && (await book(solo, s[5].id)).status === 201 && (await book(solo, s[6].id)).json?.limit === 2);
  await api('/api/admin/team-settings', { method: 'PUT', cookie: aCookie, body: { maxBookingsPerMentor: 3 } });

  section('cancel paths free the count and notify participant + team + mentor');
  await clearMp();
  // (a) admin PATCH status=cancelled on leader's booking 1
  r = await api(`/api/admin/mentor-bookings/${b1.json.booking.id}`, { method: 'PATCH', cookie: aCookie, body: { status: 'cancelled' } });
  check('admin PATCH cancelled -> 200', r.status === 200, `status=${r.status}`);
  await sleep(800);
  const nL = await notifs(leader.id, b1.json.booking.id), nMate = await notifs(mate.id, b1.json.booking.id), nM = await notifs(mentor.id, b1.json.booking.id);
  check('  dashboard: leader + teammate got "تم إلغاء جلسة الإرشاد", mentor got his notice', nL.some((n) => n.title === 'تم إلغاء جلسة الإرشاد') && nMate.some((n) => n.title === 'تم إلغاء جلسة الإرشاد') && nM.some((n) => n.title === 'إلغاء حجز جلسة'), `l=${nL.length} mate=${nMate.length} m=${nM.length}`);
  check('  email: leader + teammate + mentor received it', (await mailFor(leader.email)).length >= 1 && (await mailFor(mate.email)).length >= 1 && (await mailFor(mentor.email)).length >= 1, `l=${(await mailFor(leader.email)).length} mate=${(await mailFor(mate.email)).length} m=${(await mailFor(mentor.email)).length}`);
  check('  leader can book the mentor again (count freed)', (await book(leader, s[7].id)).status === 201);
  // (b) admin DELETE booking 2
  await clearMp();
  const del = await api(`/api/admin/mentor-bookings/${b2.json.booking.id}`, { method: 'DELETE', cookie: aCookie });
  await sleep(800);
  check('admin DELETE booking -> 200 and participant notified', del.status === 200 && (await mailFor(leader.email)).length >= 1, `status=${del.status} mails=${(await mailFor(leader.email)).length}`);
  const afterDel = await prisma.mentorBooking.count({ where: { participantId: leader.id, status: { not: 'cancelled' }, availability: { mentorId: mentor.id } } });
  check(`  leader now holds ${afterDel} live bookings with the mentor (< 3)`, afterDel < 3);
  // (c) admin deletes a BOOKED slot (mate's booking on s[3])
  await clearMp();
  const mateBooking = await prisma.mentorBooking.findFirst({ where: { participantId: mate.id, availabilityId: s[3].id } });
  r = await api(`/api/admin/mentors/${mentor.id}/availability`, { method: 'DELETE', cookie: aCookie, body: { availabilityId: s[3].id } });
  await sleep(800);
  check('admin deletes a booked slot -> 200 with cancelledBookings=1', r.status === 200 && r.json?.cancelledBookings === 1, JSON.stringify(r.json));
  check('  the booking row is gone with the slot (cascade) but the team was notified first', (await prisma.mentorBooking.findUnique({ where: { id: mateBooking.id } })) === null && (await notifs(mate.id, mateBooking.id)).some((n) => n.title === 'تم إلغاء جلسة الإرشاد') && (await mailFor(mate.email)).length >= 1);
  // (d) mentor deletes their own booked slot (solo's booking on s[4])
  await clearMp();
  const soloBooking = await prisma.mentorBooking.findFirst({ where: { participantId: solo.id, availabilityId: s[4].id } });
  r = await api(`/api/mentor/availability/${s[4].id}`, { method: 'DELETE', cookie: mCookie(mentor) });
  await sleep(800);
  check('mentor deletes a booked slot -> 200 with cancelledBookings=1', r.status === 200 && r.json?.cancelledBookings === 1, JSON.stringify(r.json));
  const soloNotif = await notifs(solo.id, soloBooking.id);
  check('  participant notified that the MENTOR cancelled (dashboard + email)', soloNotif.some((n) => /الموجه/.test(n.message)) && (await mailFor(solo.email)).length >= 1, soloNotif[0]?.message);
  // (the mentor still has the ORIGINAL booking-request notification for this booking — only a cancellation notice must be absent)
  check('  mentor did not get a cancellation notice about his own action', !(await notifs(mentor.id, soloBooking.id)).some((n) => n.title === 'إلغاء حجز جلسة'));

  section('reset all counts');
  // leader currently holds live bookings with the mentor; make it 3 again then reset
  const liveNow = await prisma.mentorBooking.count({ where: { participantId: leader.id, status: { not: 'cancelled' }, availability: { mentorId: mentor.id } } });
  for (let i = liveNow; i < 3; i++) { const extra = await slot(mentor.id); await book(leader, extra.id); }
  const blocked = await book(leader, (await slot(mentor.id)).id);
  check('leader is at the limit again (400)', blocked.status === 400, `status=${blocked.status}`);
  r = await api('/api/admin/team-settings', { method: 'PUT', cookie: aCookie, body: { resetBookingCounts: true } });
  check('admin reset -> 200 with bookingCountResetAt', r.status === 200 && !!r.json?.bookingCountResetAt, JSON.stringify(r.json?.bookingCountResetAt));
  check('  existing bookings still live (nothing cancelled)', (await prisma.mentorBooking.count({ where: { participantId: leader.id, status: 'booked', availability: { mentorId: mentor.id } } })) >= 3);
  await sleep(1100); // new bookings must be created after the reset mark
  check('  leader can book the same mentor again (fresh count)', (await book(leader, (await slot(mentor.id)).id)).status === 201);

  section('organization limit');
  await api('/api/admin/team-settings', { method: 'PUT', cookie: aCookie, body: { mentorBookingMode: 'both', maxBookingsPerMentor: 2 } });
  const o1 = await book(solo, og[0].id, org.id), o2 = await book(solo, og[1].id, org.id), o3 = await book(solo, og[2].id, org.id);
  check('org: 2 ok, 3rd refused with limit=2', o1.status === 201 && o2.status === 201 && o3.status === 400 && o3.json?.limit === 2, `${o1.status},${o2.status},${o3.status}`);
  await api(`/api/admin/mentor-bookings/${o1.json.booking.id}`, { method: 'PATCH', cookie: aCookie, body: { status: 'cancelled' } });
  check('  cancelling one frees the org count', (await book(solo, og[2].id, org.id)).status === 201);
})()
  .catch((e) => { fail++; console.error('\nSCRIPT ERROR:', e.stack); })
  .finally(async () => {
    try {
      if (settingsId && savedSettings) await prisma.teamSettings.update({ where: { id: settingsId }, data: savedSettings });
      if (savedEmail) await prisma.emailSettings.update({ where: { id: savedEmail.id }, data: savedEmail.data });
      await prisma.emailLog.deleteMany({ where: { templateKey: { in: ['bookingCancelledParticipant', 'bookingCancellation', 'bookingConfirmation', 'newBookingRequest', 'orgBookingRequest', 'orgBookingConfirmation'] } } });
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
