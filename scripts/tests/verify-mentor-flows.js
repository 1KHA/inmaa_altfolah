/**
 * Verifies the newly-wired mentor + booking notification emissions.
 *
 * Creates a throwaway mentor, availability slot and booking, drives them
 * through the real API routes, then deletes everything it created.
 */
const path = require('path');
const REPO = '/Users/kha/Documents/Code/dyam_hackathon/dhwmk_alvira';

require(path.join(REPO, 'scripts/load-env.js')).loadEnv();

const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const STAMP = Date.now();
const MENTOR_EMAIL = `verify-mentor-${STAMP}@example.invalid`;

let pass = 0, fail = 0;
const created = { mentorId: null, availabilityId: null, bookingId: null, participantId: null };

function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ' -> ' + detail : ''}`); }
}

async function api(pathname, { cookie, method = 'GET', body } = {}) {
  const res = await fetch(BASE + pathname, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

const notifsFor = (type, id) =>
  prisma.notification.findMany({ where: { recipientType: type, recipientId: id } });

async function main() {
  const admin = await prisma.admin.findFirst({ select: { id: true, username: true } });
  const adminCookie = 'token=' + jwt.sign(
    { id: admin.id, username: admin.username, role: 'admin' }, SECRET, { expiresIn: '10m' });

  // ---- 1. creating a mentor notifies admins -------------------------------
  const before = (await notifsFor('admin', admin.id)).length;

  const createRes = await api('/api/admin/mentors', {
    method: 'POST', cookie: adminCookie,
    body: { name: 'مرشد تجريبي', email: MENTOR_EMAIL, specialty: 'اختبار', phone: '0500000000', password: 'temp-pass-123' },
  });
  check('POST /api/admin/mentors still returns 201', createRes.status === 201, `status=${createRes.status}`);
  created.mentorId = createRes.json?.id;

  const afterCreate = await notifsFor('admin', admin.id);
  const addedNotif = afterCreate.find(n => n.relatedEntityId === created.mentorId);
  check('admin notified that a mentor was added', afterCreate.length === before + 1 && !!addedNotif,
    `${before} -> ${afterCreate.length}`);
  check('  message describes an addition, not an application',
    addedNotif && addedNotif.message.includes('تم إضافة مرشد جديد'), addedNotif?.message);

  // mentor starts pending
  const fresh = await prisma.mentor.findUnique({ where: { id: created.mentorId } });
  check('new mentor defaults to status=pending', fresh.status === 'pending', fresh.status);

  // ---- 2. approval fires only on the transition ---------------------------
  // Route email to Mailpit for this section: approval must email the mentor
  // their login details (fresh temporary password + login URL).
  const MAILPIT = 'http://localhost:8025';
  const settingsRow = await prisma.emailSettings.findFirst();
  const originalSettings = settingsRow ? { ...settingsRow } : null;
  if (settingsRow) {
    await prisma.emailSettings.update({
      where: { id: settingsRow.id },
      data: { host: 'localhost', port: 1025, secure: false, username: '', password: '', fromEmail: 'noreply@example.test', fromName: 'منصة دِيَم', adminInboxEmail: '', enabled: true },
    });
    await fetch(MAILPIT + '/api/v1/messages', { method: 'DELETE' });
  }
  const approve = await api('/api/admin/mentors', {
    method: 'PUT', cookie: adminCookie,
    body: { id: created.mentorId, name: 'مرشد تجريبي', email: MENTOR_EMAIL, specialty: 'اختبار', phone: '0500000000', status: 'active' },
  });
  check('PUT /api/admin/mentors still returns 200', approve.status === 200, `status=${approve.status}`);

  let mentorNotifs = await notifsFor('mentor', created.mentorId);
  check('mentor notified once on pending -> active', mentorNotifs.length === 1, `count=${mentorNotifs.length}`);
  check('  it is the approval message',
    mentorNotifs[0]?.title === 'تم قبول طلبك كمرشد', mentorNotifs[0]?.title);
  check('  dashboard message does NOT contain a password', !/كلمة المرور/.test(mentorNotifs[0]?.message || ''), mentorNotifs[0]?.message);

  if (settingsRow) {
    await new Promise((r) => setTimeout(r, 900));
    const inbox = (await (await fetch(MAILPIT + '/api/v1/messages?limit=100')).json()).messages || [];
    const mail = inbox.find((m) => (m.To || []).some((t) => t.Address === MENTOR_EMAIL));
    check('approval email reached the mentor', !!mail, `inbox=${inbox.length}`);
    if (mail) {
      const full = await (await fetch(MAILPIT + '/api/v1/message/' + mail.ID)).json();
      const text = (full.Text || '') + (full.HTML || '');
      const pw = (text.match(/كلمة المرور:\s*([A-Za-z0-9]{10})/) || [])[1];
      check('  email carries {{email}}', text.includes(MENTOR_EMAIL));
      check('  email carries {{loginUrl}}', /https?:\/\/[^\s<]+\/login/.test(text));
      check('  email carries a generated {{password}}', !!pw, text.slice(0, 200));
      if (pw) {
        const login = await api('/api/login', { method: 'POST', body: { email: MENTOR_EMAIL, password: pw } });
        check('  the emailed password logs the mentor in', login.status === 200 && (login.json?.role === 'mentor' || login.json?.user?.role === 'mentor'), `status=${login.status} ${JSON.stringify(login.json).slice(0, 120)}`);
      }
    }
    const { id: _i, updatedAt: _u, ...restore } = originalSettings;
    await prisma.emailSettings.update({ where: { id: settingsRow.id }, data: restore });
  }

  // an unrelated edit while already active must NOT re-notify
  await api('/api/admin/mentors', {
    method: 'PUT', cookie: adminCookie,
    body: { id: created.mentorId, name: 'مرشد تجريبي معدل', email: MENTOR_EMAIL, specialty: 'اختبار', phone: '0500000001', status: 'active' },
  });
  mentorNotifs = await notifsFor('mentor', created.mentorId);
  check('a second edit while already active does NOT re-notify',
    mentorNotifs.length === 1, `count=${mentorNotifs.length}`);

  // ---- 3. booking cancellation --------------------------------------------
  // The DB may have no participants; make a throwaway one and remove it after
  let participant = await prisma.participant.findFirst({ select: { id: true } });
  if (!participant) {
    participant = await prisma.participant.create({
      data: {
        email: `verify-participant-${STAMP}@example.invalid`,
        firstName: 'مشارك', secondName: 'تجريبي', familyName: 'مؤقت',
      },
      select: { id: true },
    });
    created.participantId = participant.id;
  }

  const availability = await prisma.mentorAvailability.create({
    data: {
      mentorId: created.mentorId,
      startTime: new Date(Date.now() + 86400000),
      endTime: new Date(Date.now() + 90000000),
    },
  });
  created.availabilityId = availability.id;

  const booking = await prisma.mentorBooking.create({
    data: { participantId: participant.id, availabilityId: availability.id, status: 'booked' },
  });
  created.bookingId = booking.id;

  const patch = await api(`/api/admin/mentor-bookings/${booking.id}`, {
    method: 'PATCH', cookie: adminCookie, body: { status: 'cancelled' },
  });
  check('PATCH mentor-booking still returns 200', patch.status === 200, `status=${patch.status}`);

  let cancelNotifs = (await notifsFor('mentor', created.mentorId)).filter(n => n.relatedEntityType === 'booking');
  check('mentor notified of the cancellation', cancelNotifs.length === 1, `count=${cancelNotifs.length}`);
  check('  it is the cancellation message',
    cancelNotifs[0]?.title === 'إلغاء حجز جلسة', cancelNotifs[0]?.title);

  // re-saving an already-cancelled booking must not re-notify
  await api(`/api/admin/mentor-bookings/${booking.id}`, {
    method: 'PATCH', cookie: adminCookie, body: { status: 'cancelled' },
  });
  cancelNotifs = (await notifsFor('mentor', created.mentorId)).filter(n => n.relatedEntityType === 'booking');
  check('re-cancelling does NOT send a duplicate', cancelNotifs.length === 1, `count=${cancelNotifs.length}`);

  // DELETE on an already-cancelled booking should also stay quiet
  const del = await api(`/api/admin/mentor-bookings/${booking.id}`, { method: 'DELETE', cookie: adminCookie });
  check('DELETE mentor-booking still returns 200', del.status === 200, `status=${del.status}`);
  created.bookingId = null;
  cancelNotifs = (await notifsFor('mentor', created.mentorId)).filter(n => n.relatedEntityType === 'booking');
  check('deleting an already-cancelled booking does not re-notify',
    cancelNotifs.length === 1, `count=${cancelNotifs.length}`);

  // deleting a still-booked booking SHOULD notify
  const booking2 = await prisma.mentorBooking.create({
    data: { participantId: participant.id, availabilityId: availability.id, status: 'booked' },
  });
  created.bookingId = booking2.id;
  await api(`/api/admin/mentor-bookings/${booking2.id}`, { method: 'DELETE', cookie: adminCookie });
  created.bookingId = null;
  cancelNotifs = (await notifsFor('mentor', created.mentorId)).filter(n => n.relatedEntityType === 'booking');
  check('deleting a live booking notifies the mentor', cancelNotifs.length === 2, `count=${cancelNotifs.length}`);
}

main()
  .catch((e) => { fail++; console.error('\nSCRIPT ERROR:', e.stack); })
  .finally(async () => {
    // cleanup, innermost first
    if (created.bookingId) await prisma.mentorBooking.deleteMany({ where: { id: created.bookingId } });
    if (created.availabilityId) await prisma.mentorAvailability.deleteMany({ where: { id: created.availabilityId } });
    if (created.mentorId) {
      const n = await prisma.notification.deleteMany({
        where: {
          OR: [
            { recipientType: 'mentor', recipientId: created.mentorId },
            { relatedEntityType: 'mentor', relatedEntityId: created.mentorId },
          ],
        },
      });
      await prisma.mentor.deleteMany({ where: { id: created.mentorId } });
      console.log(`\ncleaned up mentor ${created.mentorId} + ${n.count} notifications`);
    }
    if (created.participantId) {
      await prisma.participant.deleteMany({ where: { id: created.participantId } });
      console.log(`cleaned up throwaway participant ${created.participantId}`);
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    await prisma.$disconnect();
    process.exit(fail === 0 ? 0 : 1);
  });
