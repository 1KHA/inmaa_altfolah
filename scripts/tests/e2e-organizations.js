/**
 * E2E suite for mentor ORGANIZATIONS (2026-09):
 *
 *  - admin CRUD for organizations, mentors linked to an organization
 *  - the admin booking-mode setting (individual | organization | both) and
 *    how it gates /api/participant/book-appointment
 *  - booking an organization: EVERY active member is notified with the
 *    meeting link, the booker's whole team is confirmed, colleagues see the
 *    session in their bookings, one active booking per organization
 *  - individual bookings behave exactly as before
 *  - public /api/organizations hides member names in organization-only mode
 *
 * Restores mentorBookingMode to 'individual' and cleans all fixtures.
 */
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const TAG = `org${Date.now()}`;
const HOUR = 3600_000;

let pass = 0, fail = 0;
const made = { participants: [], teams: [], mentors: [], orgs: [] };
const check = (n, ok, d = '') => { if (ok) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? '  -> ' + d : ''}`); } };
const section = (s) => console.log(`\n--- ${s} ---`);
const cookie = (c) => 'token=' + jwt.sign(c, SECRET, { expiresIn: '30m' });
const pCookie = (id) => cookie({ id, participantId: id, role: 'participant' });
const mCookie = (id) => cookie({ id, mentorId: id, role: 'mentor' });

async function api(pathname, { cookie: ck, method = 'GET', body } = {}) {
  const res = await fetch(BASE + pathname, {
    method,
    headers: { ...(ck ? { cookie: ck } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
const setMode = (aCookie, mode) => api('/api/admin/team-settings', { method: 'PUT', cookie: aCookie, body: { mentorBookingMode: mode } });
// Fixed base so slots created for different mentors at the same offset share
// an identical window (the org collapses them into one slot).
const T0 = Date.now();
const mkSlot = async (mentorId, h) => prisma.mentorAvailability.create({ data: { mentorId, startTime: new Date(T0 + h * HOUR), endTime: new Date(T0 + (h + 0.25) * HOUR) } });
const notifsFor = (type, id, bookingId) => prisma.notification.findMany({ where: { recipientType: type, recipientId: id, relatedEntityType: 'booking', relatedEntityId: bookingId } });

async function main() {
  const admin = (await prisma.admin.findMany())[0];
  if (!admin) { check('an admin row exists (seed first)', false); return; }
  const aCookie = cookie({ id: admin.id, username: admin.username, role: 'admin' });

  // fixtures: a team of two + a solo participant
  const team = await prisma.team.create({ data: { teamName: `${TAG} فريق`, status: 'approved' } });
  made.teams.push(team.id);
  const leader = await prisma.participant.create({ data: { fullName: `${TAG} قائد`, email: `${TAG}-leader@t.test`, status: 'approved', teamId: team.id, isLeader: true } });
  const mate = await prisma.participant.create({ data: { fullName: `${TAG} زميل`, email: `${TAG}-mate@t.test`, status: 'approved', teamId: team.id } });
  const solo = await prisma.participant.create({ data: { fullName: `${TAG} فردي`, email: `${TAG}-solo@t.test`, status: 'approved' } });
  made.participants.push(leader.id, mate.id, solo.id);

  // ============ organization CRUD ============
  section('admin organization CRUD');
  const c = await api('/api/admin/organizations', { method: 'POST', cookie: aCookie, body: { name: `${TAG} شركة المياه`, description: 'وصف' } });
  check('create organization -> 201', c.status === 201 && c.json?.organization?.id, JSON.stringify(c.json).slice(0, 120));
  const org = c.json.organization; made.orgs.push(org.id);
  check('duplicate name -> 400', (await api('/api/admin/organizations', { method: 'POST', cookie: aCookie, body: { name: org.name } })).status === 400);
  check('empty name -> 400', (await api('/api/admin/organizations', { method: 'POST', cookie: aCookie, body: { name: '  ' } })).status === 400);
  check('participant cannot create (401)', (await api('/api/admin/organizations', { method: 'POST', cookie: pCookie(solo.id), body: { name: 'x' } })).status === 401);
  const ren = await api(`/api/admin/organizations/${org.id}`, { method: 'PUT', cookie: aCookie, body: { name: `${TAG} شركة المياه المحدودة` } });
  check('rename -> 200', ren.status === 200 && ren.json?.organization?.name.endsWith('المحدودة'), JSON.stringify(ren.json).slice(0, 100));
  const list = await api('/api/admin/organizations', { cookie: aCookie });
  check('admin list contains it', list.status === 200 && list.json.organizations.some((o) => o.id === org.id));

  // ============ mentors in an organization ============
  section('mentors linked to the organization');
  const m1r = await api('/api/admin/mentors', { method: 'POST', cookie: aCookie, body: { name: `${TAG} عضو ١`, email: `${TAG}-m1@t.test`, specialty: 'مياه', phone: '05', password: 'Test1234!', organizationId: org.id } });
  check('create mentor with organizationId -> 201', m1r.status === 201 && m1r.json?.organizationId === org.id, JSON.stringify(m1r.json).slice(0, 120));
  const m1 = m1r.json; made.mentors.push(m1.id);
  await prisma.mentor.update({ where: { id: m1.id }, data: { status: 'active' } });
  const m2 = await prisma.mentor.create({ data: { name: `${TAG} عضو ٢`, email: `${TAG}-m2@t.test`, specialty: 'طاقة', phone: '05', status: 'active', organizationId: org.id } });
  const outsider = await prisma.mentor.create({ data: { name: `${TAG} مستقل`, email: `${TAG}-out@t.test`, specialty: 'x', phone: '05', status: 'active' } });
  made.mentors.push(m2.id, outsider.id);
  check('unknown organizationId -> 400', (await api('/api/admin/mentors', { method: 'POST', cookie: aCookie, body: { name: 'x', email: `${TAG}-bad@t.test`, specialty: 'x', phone: '05', password: 'Test1234!', organizationId: 'nope' } })).status === 400);
  const adminMentors = await api('/api/admin/mentors', { cookie: aCookie });
  const m1Row = adminMentors.json.find((m) => m.id === m1.id);
  check('admin mentor list carries organization {id,name}', m1Row?.organization?.id === org.id && !!m1Row.organization.name, JSON.stringify(m1Row?.organization));
  const detach = await api('/api/admin/mentors', { method: 'PUT', cookie: aCookie, body: { id: outsider.id, name: outsider.name, email: outsider.email, specialty: 'x', phone: '05', status: 'active', organizationId: null } });
  check('PUT with organizationId:null keeps mentor unassigned', detach.status === 200 && detach.json.organizationId === null);

  const s1 = await mkSlot(m1.id, 24), s2 = await mkSlot(m2.id, 26), s3 = await mkSlot(m1.id, 28), sOut = await mkSlot(outsider.id, 24);
  // s4 = same window as s1 but offered by m2 (collapses into one org slot);
  // s5/s6 = same window (+30h) from both members, used for the busy rule.
  const s4 = await mkSlot(m2.id, 24), s5 = await mkSlot(m1.id, 30), s6 = await mkSlot(m2.id, 30);

  // ============ shared availability inside the organization ============
  section('availability added by one member is visible to all members (only when org booking is enabled)');
  // Default mode is `individual`: even org members see ONLY their own slots.
  const indivScope = await api('/api/mentor/availability?scope=organization', { cookie: mCookie(m2.id) });
  check('individual mode: scope=organization returns own slots only (no colleague slots)', indivScope.status === 200 && indivScope.json.every((a) => a.mentorId === m2.id) && !indivScope.json.some((a) => a.id === s1.id), `n=${indivScope.json?.length}`);
  await setMode(aCookie, 'both');
  const ownOnly = await api('/api/mentor/availability', { cookie: mCookie(m2.id) });
  check('default GET returns only own slots', ownOnly.status === 200 && ownOnly.json.every((a) => a.mentorId === m2.id) && !ownOnly.json.some((a) => a.id === s1.id), `n=${ownOnly.json?.length}`);
  const orgScope = await api('/api/mentor/availability?scope=organization', { cookie: mCookie(m2.id) });
  const sharedS1 = orgScope.json?.find((a) => a.id === s1.id);
  check('scope=organization shows colleague slot flagged shared with host name', !!sharedS1 && sharedS1.shared === true && sharedS1.hostMentor?.name === m1.name && sharedS1.isBooked === false, JSON.stringify(sharedS1 && { shared: sharedS1.shared, host: sharedS1.hostMentor?.name }));
  check('  own slots flagged shared:false', orgScope.json.filter((a) => a.mentorId === m2.id).every((a) => a.shared === false));
  const outScope = await api('/api/mentor/availability?scope=organization', { cookie: mCookie(outsider.id) });
  check('  mentor without organization sees only own slots', outScope.json.every((a) => a.mentorId === outsider.id));
  await setMode(aCookie, 'individual'); // back to the default for the mode section below

  // ============ booking mode setting ============
  section('booking-mode setting');
  const ts = await api('/api/admin/team-settings', { cookie: aCookie });
  check('default mode is individual', ts.json?.mentorBookingMode === 'individual', ts.json?.mentorBookingMode);
  check('invalid mode -> 400', (await setMode(aCookie, 'whatever')).status === 400);
  const toOrg = await setMode(aCookie, 'organization');
  check('set organization mode -> 200', toOrg.status === 200 && toOrg.json.mentorBookingMode === 'organization');
  const bm = await api('/api/participant/booking-mode', { cookie: pCookie(leader.id) });
  check('participant booking-mode reflects it', bm.json?.mode === 'organization' && bm.json.canBookIndividual === false && bm.json.canBookOrganization === true, JSON.stringify(bm.json));

  // ============ public organizations (org-only mode hides people) ============
  section('public organizations listing');
  const pub = await api('/api/organizations', { cookie: pCookie(leader.id) });
  const pubOrg = pub.json?.organizations?.find((o) => o.id === org.id);
  check('participant sees the organization with 2 members', pubOrg?.memberCount === 2, JSON.stringify(pubOrg));
  check('  member names hidden in organization mode', pubOrg && pubOrg.members === undefined);
  check('  free slot count = 4 windows (duplicates collapsed)', pubOrg?.availableSlots === 4, String(pubOrg?.availableSlots));
  const detail = await api(`/api/organizations?id=${org.id}`, { cookie: pCookie(leader.id) });
  check('organization slots = union of members collapsed per time window (4)', detail.json?.slots?.length === 4, String(detail.json?.slots?.length));
  check('  slot owner names hidden', detail.json.slots.every((s) => s.mentorName === null));
  const w24 = detail.json.slots.find((s) => s.id === s1.id || s.id === s4.id);
  check('  same window from two members is ONE org slot with 2 hosts', !!w24 && w24.hostMentorIds?.length === 2 && detail.json.slots.filter((s) => s.startTime === w24.startTime).length === 1, JSON.stringify(w24?.hostMentorIds));

  // ============ mode enforcement + org booking fan-out ============
  section('organization booking: enforcement + fan-out');
  const indiv = await api('/api/participant/book-appointment', { method: 'POST', cookie: pCookie(leader.id), body: { availabilityId: s1.id } });
  check('individual booking refused in organization mode (403)', indiv.status === 403, `status=${indiv.status}`);
  const wrongOrgSlot = await api('/api/participant/book-appointment', { method: 'POST', cookie: pCookie(leader.id), body: { availabilityId: sOut.id, organizationId: org.id } });
  check('slot outside the organization -> 400', wrongOrgSlot.status === 400, `status=${wrongOrgSlot.status}`);

  const ob = await api('/api/participant/book-appointment', { method: 'POST', cookie: pCookie(leader.id), body: { availabilityId: s1.id, organizationId: org.id } });
  check('organization booking -> 201 with organization in response', ob.status === 201 && ob.json?.booking?.organization?.id === org.id, JSON.stringify(ob.json).slice(0, 160));
  const bookingId = ob.json.booking.id;
  const row = await prisma.mentorBooking.findUnique({ where: { id: bookingId } });
  check('  booking row stores organizationId + meetingUrl', row?.organizationId === org.id && /^https:\/\//.test(row.meetingUrl || ''));

  const n1 = await notifsFor('mentor', m1.id, bookingId), n2 = await notifsFor('mentor', m2.id, bookingId), nOut = await notifsFor('mentor', outsider.id, bookingId);
  check('BOTH organization members notified', n1.length === 1 && n2.length === 1, `m1=${n1.length} m2=${n2.length}`);
  check('  with the organization booking template', n1[0]?.title === 'حجز جلسة جديد مع جهتكم', n1[0]?.title);
  check('  non-member mentor NOT notified', nOut.length === 0);
  const nl = await notifsFor('participant', leader.id, bookingId), nm = await notifsFor('participant', mate.id, bookingId);
  check('booker AND teammate confirmed', nl.length === 1 && nm.length === 1 && nl[0].title === 'تأكيد حجز الجلسة', `leader=${nl.length} mate=${nm.length}`);

  const seenByM2 = await api('/api/mentor/bookings', { cookie: mCookie(m2.id) });
  const viaOrg = seenByM2.json?.find((b) => b.id === bookingId);
  check('colleague (m2) sees the org booking in their sessions', !!viaOrg && viaOrg.viaOrganization === true && viaOrg.hostedByMe === false, JSON.stringify(viaOrg && { v: viaOrg.viaOrganization, h: viaOrg.hostedByMe }));
  const seenByM1 = await api('/api/mentor/bookings', { cookie: mCookie(m1.id) });
  const hosted = seenByM1.json?.find((b) => b.id === bookingId);
  check('slot owner (m1) sees it as hosted by them', !!hosted && hosted.hostedByMe === true && hosted.organization?.id === org.id);
  const mine = await api('/api/participant/my-bookings', { cookie: pCookie(leader.id) });
  check('my-bookings exposes the organization', mine.json?.some((b) => b.id === bookingId && b.organization?.id === org.id));

  // The per-organization limit is configurable (default 3); pin it to 1 here
  // so the original one-per-organization assertion keeps its meaning.
  const savedMaxOrg = (await prisma.teamSettings.findFirst())?.maxBookingsPerMentor ?? 3;
  await api('/api/admin/team-settings', { method: 'PUT', cookie: aCookie, body: { maxBookingsPerMentor: 1 } });
  const again = await api('/api/participant/book-appointment', { method: 'POST', cookie: pCookie(leader.id), body: { availabilityId: s2.id, organizationId: org.id } });
  check('second booking with the same organization refused (400) when the limit is 1', again.status === 400 && /جهة/.test(again.json?.message || '') && again.json?.limit === 1, JSON.stringify(again.json));
  await api('/api/admin/team-settings', { method: 'PUT', cookie: aCookie, body: { maxBookingsPerMentor: savedMaxOrg } });

  // ============ organization busy rule ============
  section('organization is busy whenever any member is busy');
  const afterBook = await api(`/api/organizations?id=${org.id}`, { cookie: pCookie(solo.id) });
  const w24b = afterBook.json.slots.find((s) => s.startTime === w24.startTime);
  check('the 24h window shows booked although m2 slot (s4) itself is free', !!w24b && w24b.isBooked === true, JSON.stringify(w24b && { booked: w24b.isBooked }));
  const dbl = await api('/api/participant/book-appointment', { method: 'POST', cookie: pCookie(solo.id), body: { availabilityId: s4.id, organizationId: org.id } });
  check('booking the org again in that window via the other member -> 400', dbl.status === 400 && /محجوزة/.test(dbl.json?.message || ''), `status=${dbl.status} ${dbl.json?.message}`);
  const s2Shared = (await api('/api/mentor/availability?scope=organization', { cookie: mCookie(m2.id) })).json.find((a) => a.id === s1.id);
  check('colleague dashboard shows the shared slot as booked', s2Shared?.isBooked === true);

  // ============ both mode ============
  section('both mode: either path works');
  await setMode(aCookie, 'both');
  const both1 = await api('/api/participant/book-appointment', { method: 'POST', cookie: pCookie(solo.id), body: { availabilityId: s2.id, organizationId: org.id } });
  check('organization booking allowed', both1.status === 201, `status=${both1.status} ${JSON.stringify(both1.json).slice(0, 100)}`);
  const both2 = await api('/api/participant/book-appointment', { method: 'POST', cookie: pCookie(solo.id), body: { availabilityId: sOut.id } });
  check('individual booking allowed (classic flow)', both2.status === 201, `status=${both2.status}`);
  const nOutIndiv = await notifsFor('mentor', outsider.id, both2.json.booking.id);
  check('  classic booking notifies only that mentor with the classic template', nOutIndiv.length === 1 && nOutIndiv[0].title === 'طلب حجز جلسة جديد', nOutIndiv[0]?.title);
  const plist = await api('/api/admin/mentors', { cookie: pCookie(solo.id) });
  const pm1 = plist.json?.find((m) => m.id === m1.id);
  check('participant mentor list carries organization but NO email/phone', !!pm1 && pm1.organization?.id === org.id && pm1.email === undefined && pm1.phone === undefined, JSON.stringify(pm1 && { org: pm1.organization?.id, email: pm1.email, phone: pm1.phone }));
  const alist = await api('/api/admin/mentors', { cookie: aCookie });
  check('  admin list still has email/phone', !!alist.json?.find((m) => m.id === m1.id && m.email && m.phone));
  const pubBoth = await api(`/api/organizations?id=${org.id}`, { cookie: pCookie(solo.id) });
  check('member names revealed in both mode', pubBoth.json?.slots?.every((s) => typeof s.mentorName === 'string' && s.mentorName.length > 0));
  const w30 = pubBoth.json.slots.find((s) => s.id === s5.id || s.id === s6.id);
  check('  collapsed window lists both host names', !!w30 && w30.mentorName.includes(m1.name) && w30.mentorName.includes(m2.name), w30?.mentorName);
  // An INDIVIDUAL booking with one member also makes the organization busy there
  const indivS5 = await api('/api/participant/book-appointment', { method: 'POST', cookie: pCookie(solo.id), body: { availabilityId: s5.id } });
  check('individual booking with m1 at +30h -> 201', indivS5.status === 201, `status=${indivS5.status} ${indivS5.json?.message || ''}`);
  const w30After = (await api(`/api/organizations?id=${org.id}`, { cookie: pCookie(mate.id) })).json.slots.find((s) => s.startTime === w30.startTime);
  check('  org window now shows booked', w30After?.isBooked === true);
  const orgS6 = await api('/api/participant/book-appointment', { method: 'POST', cookie: pCookie(mate.id), body: { availabilityId: s6.id, organizationId: org.id } });
  check('  org booking via m2 in the same window refused (400 busy)', orgS6.status === 400 && /محجوزة/.test(orgS6.json?.message || ''), `status=${orgS6.status} ${orgS6.json?.message}`);

  // ============ individual mode ============
  section('individual mode: organization bookings refused');
  await setMode(aCookie, 'individual');
  const refused = await api('/api/participant/book-appointment', { method: 'POST', cookie: pCookie(mate.id), body: { availabilityId: s3.id, organizationId: org.id } });
  check('organization booking -> 403', refused.status === 403, `status=${refused.status}`);
  const classic = await api('/api/participant/book-appointment', { method: 'POST', cookie: pCookie(mate.id), body: { availabilityId: s3.id } });
  check('individual booking still works exactly as before', classic.status === 201, `status=${classic.status}`);

  // ============ delete organization detaches, keeps bookings ============
  section('deleting an organization');
  const del = await api(`/api/admin/organizations/${org.id}`, { method: 'DELETE', cookie: aCookie });
  check('delete -> 200', del.status === 200, `status=${del.status}`);
  check('members detached (organizationId null)', (await prisma.mentor.count({ where: { id: { in: [m1.id, m2.id] }, organizationId: null } })) === 2);
  check('org bookings survive with organizationId null', (await prisma.mentorBooking.findUnique({ where: { id: bookingId } }))?.organizationId === null);
  made.orgs = made.orgs.filter((id) => id !== org.id);
}

main()
  .catch((e) => { fail++; console.error('SUITE ERROR:', e); })
  .finally(async () => {
    try {
      await prisma.teamSettings.updateMany({ data: { mentorBookingMode: 'individual' } });
      await prisma.notification.deleteMany({ where: { OR: [{ recipientId: { in: [...made.participants, ...made.mentors] } }, { title: { startsWith: TAG } }] } });
      await prisma.emailLog.deleteMany({ where: { templateKey: { in: ['orgBookingRequest', 'orgBookingConfirmation', 'newBookingRequest', 'bookingConfirmation'] } } });
      await prisma.mentorBooking.deleteMany({ where: { participantId: { in: made.participants } } });
      await prisma.mentorAvailability.deleteMany({ where: { mentorId: { in: made.mentors } } });
      await prisma.mentor.deleteMany({ where: { id: { in: made.mentors } } });
      await prisma.organization.deleteMany({ where: { OR: [{ id: { in: made.orgs } }, { name: { startsWith: TAG } }] } });
      await prisma.participant.deleteMany({ where: { id: { in: made.participants } } });
      await prisma.team.deleteMany({ where: { id: { in: made.teams } } });
    } catch (e) { console.error('cleanup error:', e.message); }
    await prisma.$disconnect();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail > 0 ? 1 : 0);
  });
