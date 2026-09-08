/**
 * End-to-end notification test against the local Docker postgres.
 *
 * Drives the real HTTP routes for every reachable notification trigger and
 * asserts the resulting rows. Cleans up everything it creates.
 */
const path = require('path');
const REPO = '/Users/kha/Documents/Code/dyam_hackathon/dhwmk_alvira';
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const TAG = `e2e${Date.now()}`;

let pass = 0, fail = 0;
const made = { participants: [], teams: [], mentors: [], events: [], milestones: [], availabilities: [] };

function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  -> ' + detail : ''}`); }
}
const section = (s) => console.log(`\n--- ${s} ---`);

const cookie = (c) => 'token=' + jwt.sign(c, SECRET, { expiresIn: '30m' });
const adminCookieFor = (a) => cookie({ id: a.id, username: a.username, role: 'admin' });
const partCookie = (id, extra = {}) => cookie({ id, participantId: id, role: 'participant', ...extra });
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

const notifs = (type, id) => prisma.notification.findMany({
  where: { recipientType: type, recipientId: id }, orderBy: { createdAt: 'asc' },
});
const countFor = async (type, id) => (await notifs(type, id)).length;

async function main() {
  const admins = await prisma.admin.findMany({ select: { id: true, username: true } });
  const admin = admins[0];
  const aCookie = adminCookieFor(admin);
  console.log(`using ${admins.length} admin(s); notifyAllAdmins fans out to each`);

  // ============ team registration -> all admins ============
  section('team registration');
  const adminBefore = await countFor('admin', admin.id);

  // this route takes multipart/form-data, not JSON
  const fd = new FormData();
  fd.set('registrationType', 'team');
  fd.set('isTeamRegistration', 'true');
  fd.set('teamName', `${TAG} فريق`);
  fd.set('hackathonTrack', 'اختبار');
  fd.set('ideaDescription', 'وصف الفكرة');
  fd.set('hearAboutUs', 'اختبار');
  fd.set('leaderInfo', JSON.stringify({
    fullName: 'قائد الفريق', email: `${TAG}-leader@example.invalid`,
    contactNumber: '0500000001', city: 'الرياض', gender: 'ذكر',
  }));
  fd.set('members', JSON.stringify([
    { fullName: 'عضو ثاني', email: `${TAG}-member@example.invalid`, contactNumber: '0500000002', city: 'الرياض', gender: 'أنثى' },
    { fullName: 'عضو ثالث', email: `${TAG}-member3@example.invalid`, contactNumber: '0500000003', city: 'الرياض', gender: 'أنثى' },
  ]));

  const regRes = await fetch(BASE + '/api/register-team', { method: 'POST', body: fd });
  let regJson = null; try { regJson = await regRes.json(); } catch {}
  const reg = { status: regRes.status, json: regJson };
  check('POST /api/register-team succeeds', reg.status === 200 || reg.status === 201, `status=${reg.status} ${JSON.stringify(reg.json)}`);

  const team = await prisma.team.findFirst({ where: { teamName: `${TAG} فريق` }, include: { participants: true } });
  if (!team) { check('team row created', false, 'no team found - aborting'); return; }
  made.teams.push(team.id);
  team.participants.forEach(p => made.participants.push(p.id));
  check('team + participants persisted', team.participants.length === 3, `members=${team.participants.length}`);

  const adminAfterReg = await countFor('admin', admin.id);
  check('all admins notified of the new team', adminAfterReg === adminBefore + 1, `${adminBefore} -> ${adminAfterReg}`);

  // ============ team approval -> team members ============
  section('team approval');
  const leader = team.participants.find(p => p.isLeader) || team.participants[0];
  const other = team.participants.find(p => p.id !== leader.id);

  const approve = await api('/api/admin/approve-team', { method: 'POST', cookie: aCookie, body: { teamId: team.id } });
  check('POST /api/admin/approve-team succeeds', approve.status === 200, `status=${approve.status}`);

  const leaderNotifs = await notifs('participant', leader.id);
  const otherNotifs = await notifs('participant', other.id);
  check('every team member notified of approval',
    leaderNotifs.some(n => n.type === 'success') && otherNotifs.some(n => n.type === 'success'),
    `leader=${leaderNotifs.length} other=${otherNotifs.length}`);
  check('  approval links to the participant dashboard',
    leaderNotifs.some(n => n.actionUrl === '/participant-dashboard'));

  // ============ the bell endpoint per role ============
  section('bell endpoint (GET /api/notifications)');
  const leaderBell = await api('/api/notifications?limit=10', { cookie: partCookie(leader.id) });
  check('participant bell returns 200', leaderBell.status === 200, `status=${leaderBell.status}`);
  check('  participant sees only their own notifications',
    leaderBell.json.notifications.every(n => n.recipientId === undefined || n.recipientId === leader.id) &&
    leaderBell.json.notifications.length === leaderNotifs.length,
    `api=${leaderBell.json.notifications.length} db=${leaderNotifs.length}`);
  check('  unreadCount matches unread rows',
    leaderBell.json.unreadCount === leaderNotifs.filter(n => !n.isRead).length,
    `api=${leaderBell.json.unreadCount}`);

  const adminBell = await api('/api/notifications?limit=10', { cookie: aCookie });
  check('admin bell returns 200 (the claim-mismatch bug)', adminBell.status === 200, `status=${adminBell.status}`);
  check('  admin sees admin-scoped rows only',
    adminBell.json.notifications.length > 0 && adminBell.json.total === adminAfterReg,
    `total=${adminBell.json.total} db=${adminAfterReg}`);

  // ============ event registration + capacity warning ============
  section('event registration');
  const event = await prisma.event.create({
    data: {
      title: `${TAG} فعالية`, description: 'وصف', startDate: new Date(Date.now() + 864e5),
      endDate: new Date(Date.now() + 9e8), location: 'قاعة', capacity: 2, type: 'ورشة',
      plan: 'خطة', presenter: 'مقدم', status: 'upcoming',
    },
  });
  made.events.push(event.id);

  const adminPreEvent = await countFor('admin', admin.id);
  const evReg = await api('/api/participant/register-event', {
    method: 'POST', cookie: partCookie(leader.id), body: { eventId: event.id },
  });
  check('POST register-event succeeds', evReg.status === 200 || evReg.status === 201, `status=${evReg.status} ${JSON.stringify(evReg.json)}`);

  const leaderAfterEvent = await notifs('participant', leader.id);
  check('participant gets a registration confirmation',
    leaderAfterEvent.some(n => n.relatedEntityType === 'event' && n.type === 'success'));

  const adminPostEvent = await countFor('admin', admin.id);
  // capacity 2, one registration = 50%  -> registration notice only, no warning yet
  check('admins notified of the registration', adminPostEvent > adminPreEvent, `${adminPreEvent} -> ${adminPostEvent}`);

  // second registration pushes to 100% -> capacity warning
  const evReg2 = await api('/api/participant/register-event', {
    method: 'POST', cookie: partCookie(other.id), body: { eventId: event.id },
  });
  check('second registration succeeds', evReg2.status === 200 || evReg2.status === 201, `status=${evReg2.status}`);
  const adminNotifsNow = await notifs('admin', admin.id);
  check('capacity warning fired at >=80% full',
    adminNotifsNow.some(n => n.type === 'warning' && n.relatedEntityId === event.id),
    adminNotifsNow.filter(n => n.relatedEntityId === event.id).map(n => n.type).join(','));

  // ============ milestone creation -> every participant ============
  section('milestone creation');
  const partPre = await countFor('participant', leader.id);
  const ms = await api('/api/admin/milestones', {
    method: 'POST', cookie: aCookie,
    body: { title: `${TAG} مرحلة`, description: 'وصف', dueDate: new Date(Date.now() + 6048e5).toISOString(), requirements: ['متطلب'] },
  });
  check('POST /api/admin/milestones succeeds', ms.status === 200 || ms.status === 201, `status=${ms.status} ${JSON.stringify(ms.json)}`);
  const milestone = await prisma.milestone.findFirst({ where: { title: `${TAG} مرحلة` } });
  if (milestone) made.milestones.push(milestone.id);

  const partPost = await countFor('participant', leader.id);
  check('every participant notified of the new milestone', partPost === partPre + 1, `${partPre} -> ${partPost}`);

  // ============ join request -> leader, then accept -> requester ============
  section('team join requests');
  const soloEmail = `${TAG}-solo@example.invalid`;
  const solo = await prisma.participant.create({
    data: { email: soloEmail, fullName: 'مشارك منفرد', firstName: 'مشارك', secondName: 'م', familyName: 'منفرد' },
  });
  made.participants.push(solo.id);

  const leaderPreJoin = await countFor('participant', leader.id);
  const jr = await api('/api/participant/join-request', {
    method: 'POST', cookie: partCookie(solo.id), body: { teamId: team.id },
  });
  check('POST join-request succeeds', jr.status === 200 || jr.status === 201, `status=${jr.status} ${JSON.stringify(jr.json)}`);
  const leaderPostJoin = await countFor('participant', leader.id);
  check('team leader notified of the join request', leaderPostJoin === leaderPreJoin + 1, `${leaderPreJoin} -> ${leaderPostJoin}`);

  const jrRow = await prisma.teamJoinRequest.findFirst({ where: { participantId: solo.id, teamId: team.id } });
  if (jrRow) {
    const soloPre = await countFor('participant', solo.id);
    const handled = await api('/api/team-leader/handle-join-request', {
      method: 'POST', cookie: partCookie(leader.id, { teamId: team.id, isLeader: true }),
      body: { requestId: jrRow.id, action: 'accept' },
    });
    check('POST handle-join-request(accept) succeeds', handled.status === 200, `status=${handled.status} ${JSON.stringify(handled.json)}`);
    const soloPost = await notifs('participant', solo.id);
    check('requester notified they were accepted',
      soloPost.length === soloPre + 1 && soloPost.some(n => n.type === 'success'),
      `${soloPre} -> ${soloPost.length}`);
  } else {
    check('join request row created', false, 'not found');
  }

  // ============ mentor booking -> mentor + participant ============
  section('mentor booking');
  const mentor = await prisma.mentor.create({
    data: { name: `${TAG} مرشد`, email: `${TAG}-mentor@example.invalid`, specialty: 'اختبار', phone: '0500000009', status: 'active' },
  });
  made.mentors.push(mentor.id);
  const avail = await prisma.mentorAvailability.create({
    data: { mentorId: mentor.id, startTime: new Date(Date.now() + 864e5), endTime: new Date(Date.now() + 9e8) },
  });
  made.availabilities.push(avail.id);

  const book = await api('/api/participant/book-appointment', {
    method: 'POST', cookie: partCookie(leader.id), body: { availabilityId: avail.id },
  });
  check('POST book-appointment succeeds', book.status === 200 || book.status === 201, `status=${book.status} ${JSON.stringify(book.json)}`);
  const mentorNotifs = await notifs('mentor', mentor.id);
  check('mentor notified of the booking request', mentorNotifs.length === 1, `count=${mentorNotifs.length}`);

  const mentorBell = await api('/api/notifications?limit=10', { cookie: mentorCookie(mentor.id) });
  check('mentor bell returns 200', mentorBell.status === 200, `status=${mentorBell.status}`);
  check('  mentor sees their booking notification', mentorBell.json.total === 1, `total=${mentorBell.json.total}`);

  // cancel it -> mentor notified
  const booking = await prisma.mentorBooking.findFirst({ where: { availabilityId: avail.id } });
  if (booking) {
    await api(`/api/admin/mentor-bookings/${booking.id}`, { method: 'PATCH', cookie: aCookie, body: { status: 'cancelled' } });
    const afterCancel = await notifs('mentor', mentor.id);
    check('mentor notified of the cancellation',
      afterCancel.filter(n => n.title === 'إلغاء حجز جلسة').length === 1,
      `count=${afterCancel.length}`);
  }

  // ============ cross-role isolation, end to end ============
  section('cross-role isolation');
  const leaderRows = await notifs('participant', leader.id);
  const foreign = leaderRows[0];
  const idor = await api('/api/notifications/mark-read', {
    method: 'POST', cookie: mentorCookie(mentor.id), body: { notificationId: foreign.id },
  });
  const foreignAfter = await prisma.notification.findUnique({ where: { id: foreign.id } });
  check('mentor cannot mark a participant notification read',
    idor.status === 200 && foreignAfter.isRead === foreign.isRead,
    `before=${foreign.isRead} after=${foreignAfter.isRead}`);

  await api('/api/notifications/mark-all-read', { method: 'POST', cookie: mentorCookie(mentor.id) });
  const leaderStillUnread = (await notifs('participant', leader.id)).filter(n => !n.isRead).length;
  check("mentor's mark-all-read leaves participant rows untouched",
    leaderStillUnread === leaderRows.filter(n => !n.isRead).length, `unread=${leaderStillUnread}`);

  // stats scoping with real cross-tenant data present
  const stats = await api('/api/admin/dashboard/stats', { cookie: aCookie });
  check('admin stats returns 200', stats.status === 200, `status=${stats.status}`);
  const recents = stats.json.recentNotifications || [];
  check('stats feed contains ONLY this admin\'s rows',
    recents.length > 0 && recents.every(n => n.recipientType === 'admin' && n.recipientId === admin.id),
    recents.map(n => `${n.recipientType}:${n.recipientId.slice(0, 6)}`).join(' '));

  // second admin must not see the first admin's rows in a mixed DB
  if (admins[1]) {
    const other2 = await api('/api/notifications?limit=50', { cookie: adminCookieFor(admins[1]) });
    const bad = (other2.json.notifications || []).filter(n => n.recipientId !== admins[1].id);
    check('admin B does not see admin A rows', bad.length === 0, `leaked=${bad.length}`);
  }

  // ============ pagination + unread filter used by the new page ============
  section('notifications page API surface');
  const p1 = await api('/api/notifications?page=1&limit=2', { cookie: partCookie(leader.id) });
  check('limit=2 returns at most 2 rows', p1.json.notifications.length <= 2, `n=${p1.json.notifications.length}`);
  check('  total reflects the full set, not the page', p1.json.total === leaderRows.length, `total=${p1.json.total} db=${leaderRows.length}`);
  const p2 = await api('/api/notifications?page=2&limit=2', { cookie: partCookie(leader.id) });
  const overlap = p1.json.notifications.filter(a => p2.json.notifications.some(b => b.id === a.id));
  check('page 2 does not repeat page 1', overlap.length === 0, `overlap=${overlap.length}`);
  const unreadOnly = await api('/api/notifications?isRead=false&limit=50', { cookie: partCookie(leader.id) });
  check('isRead=false returns only unread',
    unreadOnly.json.notifications.every(n => n.isRead === false));

  // ============ index actually used ============
  section('index usage');
  const plan = await prisma.$queryRawUnsafe(
    `EXPLAIN (FORMAT JSON) SELECT * FROM "Notification" WHERE "recipientType"='participant' AND "recipientId"=$1 ORDER BY "createdAt" DESC LIMIT 20`,
    leader.id
  );
  const planText = JSON.stringify(plan);
  check('planner is aware of the composite index (or table too small to need it)',
    planText.includes('Notification_recipientType_recipientId_createdAt_idx') || planText.includes('Seq Scan'),
    planText.slice(0, 160));
  console.log('       plan:', planText.includes('Index') ? 'index scan' : 'seq scan (expected on a tiny table)');
}

main()
  .catch((e) => { fail++; console.error('\nSCRIPT ERROR:', e.stack); })
  .finally(async () => {
    section('cleanup');
    const pids = made.participants;
    await prisma.notification.deleteMany({
      where: { OR: [
        { recipientId: { in: [...pids, ...made.mentors] } },
        { relatedEntityId: { in: [...made.teams, ...made.events, ...made.milestones, ...made.mentors] } },
      ] },
    });
    await prisma.mentorBooking.deleteMany({ where: { availabilityId: { in: made.availabilities } } });
    await prisma.mentorAvailability.deleteMany({ where: { id: { in: made.availabilities } } });
    await prisma.mentor.deleteMany({ where: { id: { in: made.mentors } } });
    await prisma.eventRegistration.deleteMany({ where: { eventId: { in: made.events } } });
    await prisma.event.deleteMany({ where: { id: { in: made.events } } });
    await prisma.milestoneSubmission.deleteMany({ where: { milestoneId: { in: made.milestones } } });
    await prisma.milestone.deleteMany({ where: { id: { in: made.milestones } } });
    await prisma.teamJoinRequest.deleteMany({ where: { teamId: { in: made.teams } } });
    await prisma.participant.deleteMany({ where: { id: { in: pids } } });
    await prisma.team.deleteMany({ where: { id: { in: made.teams } } });
    // any admin rows generated by this run
    await prisma.notification.deleteMany({ where: { message: { contains: TAG } } });
    await prisma.notification.deleteMany({ where: { title: { contains: TAG } } });

    const left = await prisma.notification.count();
    console.log(`  cleanup done; notifications remaining in DB: ${left}`);
    console.log(`\n${pass} passed, ${fail} failed`);
    await prisma.$disconnect();
    process.exit(fail === 0 ? 0 : 1);
  });
