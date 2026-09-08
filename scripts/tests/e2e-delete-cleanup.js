/**
 * Regression suite for the FK-violation crash on participant/team deletion
 * (production error: `EventRegistration_participantId_fkey`).
 *
 * Participant has NO onDelete: Cascade relations, so the delete routes must
 * remove every dependent row (join requests, bookings, submissions, event
 * registrations, attendance records) before deleting the participant.
 *
 * Same harness as the sibling suites: real HTTP + Prisma assertions, fixtures
 * removed in `finally`.
 */
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const TAG = `e2edel${Date.now()}`;

let pass = 0, fail = 0;
const made = { participants: [], teams: [], mentors: [], events: [], milestones: [] };

function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  -> ' + detail : ''}`); }
}
const section = (s) => console.log(`\n--- ${s} ---`);
const cookie = (c) => 'token=' + jwt.sign(c, SECRET, { expiresIn: '30m' });

async function api(pathname, { cookie: ck, method = 'GET', body } = {}) {
  const res = await fetch(BASE + pathname, {
    method,
    headers: { ...(ck ? { cookie: ck } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

/** Creates one dependent row of every FK-constrained type for a participant. */
async function attachAllDependents(participantId, { team, mentor, event, milestone, admin }) {
  const avail = await prisma.mentorAvailability.create({
    data: { mentorId: mentor.id, startTime: new Date(Date.now() + 864e5), endTime: new Date(Date.now() + 865e5) },
  });
  await prisma.mentorBooking.create({ data: { participantId, availabilityId: avail.id, status: 'booked' } });
  await prisma.teamJoinRequest.create({ data: { participantId, teamId: team.id, status: 'pending' } });
  await prisma.milestoneSubmission.create({
    data: { participantId, milestoneId: milestone.id, filePath: '/x.pdf', fileName: 'x.pdf' },
  });
  await prisma.eventRegistration.create({ data: { participantId, eventId: event.id } });
  await prisma.attendanceRecord.create({
    data: { participantId, eventId: event.id, scannedBy: admin.id, method: 'manual' },
  });
  await prisma.notification.create({
    data: { title: `${TAG}`, message: 'x', type: 'info', recipientType: 'participant', recipientId: participantId },
  });
}

const dependentCounts = async (participantId) => ({
  jr: await prisma.teamJoinRequest.count({ where: { participantId } }),
  mb: await prisma.mentorBooking.count({ where: { participantId } }),
  ms: await prisma.milestoneSubmission.count({ where: { participantId } }),
  er: await prisma.eventRegistration.count({ where: { participantId } }),
  ar: await prisma.attendanceRecord.count({ where: { participantId } }),
});

async function main() {
  const admin = (await prisma.admin.findMany())[0];
  if (!admin) { check('an admin row exists (seed the DB first)', false); return; }
  const aCookie = cookie({ id: admin.id, username: admin.username, role: 'admin' });

  // shared fixtures
  const team = await prisma.team.create({ data: { teamName: `${TAG} فريق`, status: 'approved' } });
  made.teams.push(team.id);
  const mentor = await prisma.mentor.create({
    data: { name: `${TAG} م`, email: `${TAG}-m@t.test`, specialty: 'x', phone: '05', status: 'active' },
  });
  made.mentors.push(mentor.id);
  const event = await prisma.event.create({
    data: {
      title: `${TAG} فعالية`, description: 'x', startDate: new Date(Date.now() + 864e5),
      endDate: new Date(Date.now() + 865e5), location: 'x', capacity: 10, type: 'x', plan: 'x', presenter: 'x',
    },
  });
  made.events.push(event.id);
  const milestone = await prisma.milestone.create({
    data: { title: `${TAG} مرحلة`, description: 'x', dueDate: new Date(Date.now() + 864e5), requirements: '[]' },
  });
  made.milestones.push(milestone.id);
  const shared = { team, mentor, event, milestone, admin };

  // ============ individual participant with every dependent row ============
  section('delete-participant removes every dependent row');
  const solo = await prisma.participant.create({
    data: { fullName: `${TAG} فردي`, email: `${TAG}-solo@t.test`, status: 'approved' },
  });
  made.participants.push(solo.id);
  await attachAllDependents(solo.id, shared);

  const del = await api('/api/admin/delete-participant', {
    method: 'POST', cookie: aCookie, body: { participantId: solo.id },
  });
  check('POST delete-participant returns 200 (was FK 500)', del.status === 200, `status=${del.status} ${JSON.stringify(del.json)}`);
  check('participant row is gone', (await prisma.participant.findUnique({ where: { id: solo.id } })) === null);
  const counts = await dependentCounts(solo.id);
  check('all dependent rows are gone', Object.values(counts).every((n) => n === 0), JSON.stringify(counts));
  check('participant notifications are gone',
    (await prisma.notification.count({ where: { recipientType: 'participant', recipientId: solo.id } })) === 0);

  // ============ team member still refuses individual deletion ============
  section('guard rails unchanged');
  const member = await prisma.participant.create({
    data: { fullName: `${TAG} عضو`, email: `${TAG}-member@t.test`, status: 'approved', teamId: team.id },
  });
  made.participants.push(member.id);
  const refuse = await api('/api/admin/delete-participant', {
    method: 'POST', cookie: aCookie, body: { participantId: member.id },
  });
  check('team member individual delete still refused (400)', refuse.status === 400, `status=${refuse.status}`);
  const noAuth = await api('/api/admin/delete-participant', { method: 'POST', body: { participantId: member.id } });
  check('unauthenticated delete still refused (401)', noAuth.status === 401, `status=${noAuth.status}`);

  // ============ delete-team with attendance records (the latent twin bug) ============
  section('delete-team also cleans attendance records');
  await attachAllDependents(member.id, shared);

  const delTeam = await api('/api/admin/delete-team', {
    method: 'POST', cookie: aCookie, body: { teamId: team.id },
  });
  check('POST delete-team returns 200', delTeam.status === 200, `status=${delTeam.status} ${JSON.stringify(delTeam.json)}`);
  check('team row is gone', (await prisma.team.findUnique({ where: { id: team.id } })) === null);
  check('member row is gone', (await prisma.participant.findUnique({ where: { id: member.id } })) === null);
  const mCounts = await dependentCounts(member.id);
  check('member dependent rows are gone (incl. attendance)',
    Object.values(mCounts).every((n) => n === 0), JSON.stringify(mCounts));
}

main()
  .catch((e) => { fail++; console.error('SUITE ERROR:', e); })
  .finally(async () => {
    try {
      await prisma.notification.deleteMany({ where: { OR: [
        { recipientId: { in: made.participants } },
        { title: { startsWith: TAG } },
      ] } });
      await prisma.attendanceRecord.deleteMany({ where: { participantId: { in: made.participants } } });
      await prisma.eventRegistration.deleteMany({ where: { participantId: { in: made.participants } } });
      await prisma.milestoneSubmission.deleteMany({ where: { participantId: { in: made.participants } } });
      await prisma.mentorBooking.deleteMany({ where: { participantId: { in: made.participants } } });
      await prisma.teamJoinRequest.deleteMany({ where: { participantId: { in: made.participants } } });
      await prisma.participant.deleteMany({ where: { id: { in: made.participants } } });
      await prisma.mentorAvailability.deleteMany({ where: { mentorId: { in: made.mentors } } });
      await prisma.mentor.deleteMany({ where: { id: { in: made.mentors } } });
      await prisma.eventRegistration.deleteMany({ where: { eventId: { in: made.events } } });
      await prisma.event.deleteMany({ where: { id: { in: made.events } } });
      await prisma.milestone.deleteMany({ where: { id: { in: made.milestones } } });
      await prisma.teamJoinRequest.deleteMany({ where: { teamId: { in: made.teams } } });
      await prisma.team.deleteMany({ where: { id: { in: made.teams } } });
    } catch (e) {
      console.error('cleanup error:', e.message);
    }
    await prisma.$disconnect();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail > 0 ? 1 : 0);
  });
