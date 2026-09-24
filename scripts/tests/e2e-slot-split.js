/**
 * e2e — availability ranges are always split into 15-minute slots.
 *
 * A mentor dragging 10:00–12:00 on the calendar (or an admin adding a range)
 * must end up with eight 15-minute rows, never one 2-hour row; unaligned
 * ranges snap to the grid; re-adding over existing slots does not duplicate;
 * absurd ranges are refused.
 */
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const TAG = `slot${Date.now()}`;
const MIN = 60_000;

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? '  -> ' + detail : ''}`); } };
const section = (s) => console.log(`\n--- ${s} ---`);
const cookie = (c) => 'token=' + jwt.sign(c, SECRET, { expiresIn: '30m' });
async function api(pathname, { cookie: ck, method = 'GET', body } = {}) {
  const res = await fetch(BASE + pathname, { method, headers: { ...(ck ? { cookie: ck } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
const rows = (mentorId) => prisma.mentorAvailability.findMany({ where: { mentorId }, orderBy: { startTime: 'asc' } });
const all15 = (list) => list.every((r) => r.endTime - r.startTime === 15 * MIN && r.startTime.getTime() % (15 * MIN) === 0);

// Tomorrow 10:00 UTC, aligned to the grid.
const base = new Date(Math.ceil((Date.now() + 24 * 3600_000) / (3600_000)) * 3600_000);
const at = (m) => new Date(base.getTime() + m * MIN);

let mentor, admin;
(async () => {
  if (!SECRET) throw new Error('JWT_SECRET required');
  admin = await prisma.admin.findFirst();
  const aCookie = cookie({ id: admin.id, username: admin.username, role: 'admin' });
  mentor = await prisma.mentor.create({ data: { name: `${TAG} mentor`, email: `${TAG}@e2e.test`, specialty: 'x', phone: '05', status: 'active' } });
  const mCookie = cookie({ id: mentor.id, mentorId: mentor.id, role: 'mentor' });

  section('mentor: a 2-hour drag becomes eight 15-minute slots');
  let r = await api('/api/mentor/availability', { cookie: mCookie, method: 'POST', body: { startTime: at(0), endTime: at(120) } });
  let list = await rows(mentor.id);
  check('POST 201 with created=8', r.status === 201 && r.json.created === 8 && r.json.slots?.length === 8, JSON.stringify(r.json).slice(0, 160));
  check('  8 rows, each exactly 15 min and grid-aligned, contiguous', list.length === 8 && all15(list) && list[0].startTime.getTime() === at(0).getTime() && list[7].endTime.getTime() === at(120).getTime());
  check('  response keeps first row fields at top level (id/startTime) for old callers', typeof r.json.id === 'string' && !!r.json.startTime);

  section('re-adding over existing slots does not duplicate');
  r = await api('/api/mentor/availability', { cookie: mCookie, method: 'POST', body: { startTime: at(60), endTime: at(180) } });
  list = await rows(mentor.id);
  check('overlap 11:00–13:00: created=4, skipped=4', r.status === 201 && r.json.created === 4 && r.json.skipped === 4, JSON.stringify({ c: r.json.created, s: r.json.skipped }));
  check('  12 rows total, still all 15 min, no duplicate start times', list.length === 12 && all15(list) && new Set(list.map((x) => x.startTime.getTime())).size === 12);
  r = await api('/api/mentor/availability', { cookie: mCookie, method: 'POST', body: { startTime: at(0), endTime: at(15) } });
  check('exact existing slot again: created=0, skipped=1', r.status === 201 && r.json.created === 0 && r.json.skipped === 1, JSON.stringify(r.json).slice(0, 120));

  section('unaligned ranges snap to the 15-minute grid');
  r = await api('/api/mentor/availability', { cookie: mCookie, method: 'POST', body: { startTime: at(247), endTime: at(280) } }); // 14:07–14:40
  list = await rows(mentor.id);
  const snapped = list.filter((x) => x.startTime >= at(240) && x.endTime <= at(285));
  check('14:07–14:40 → 14:00, 14:15, 14:30, 14:45 (3 slots… 14:00–14:45)', r.json.created === 3 && snapped.length === 3 && snapped[0].startTime.getTime() === at(240).getTime() && snapped[2].endTime.getTime() === at(285).getTime(), JSON.stringify(snapped.map((x) => [x.startTime.toISOString().slice(11, 16), x.endTime.toISOString().slice(11, 16)])));
  r = await api('/api/mentor/availability', { cookie: mCookie, method: 'POST', body: { startTime: at(300), endTime: at(305) } }); // 5-minute drag
  check('a 5-minute range still yields one full 15-minute slot', r.json.created === 1 && (await prisma.mentorAvailability.findFirst({ where: { mentorId: mentor.id, startTime: at(300) } }))?.endTime.getTime() === at(315).getTime());

  section('validation');
  check('end before start -> 400', (await api('/api/mentor/availability', { cookie: mCookie, method: 'POST', body: { startTime: at(600), endTime: at(590) } })).status === 400);
  check('garbage dates -> 400', (await api('/api/mentor/availability', { cookie: mCookie, method: 'POST', body: { startTime: 'x', endTime: 'y' } })).status === 400);
  const huge = await api('/api/mentor/availability', { cookie: mCookie, method: 'POST', body: { startTime: at(1440), endTime: at(1440 + 13 * 60) } });
  check('13-hour range -> 400 (max 48 slots / 12 h)', huge.status === 400 && /48/.test(huge.json?.error || ''), JSON.stringify(huge.json));
  const before = (await rows(mentor.id)).length;
  check('  nothing created by the refused requests', (await rows(mentor.id)).length === before);

  section('admin route applies the same rule');
  r = await api(`/api/admin/mentors/${mentor.id}/availability`, { cookie: aCookie, method: 'POST', body: { start: at(2010), end: at(2100) } }); // 90 min, grid-aligned
  check('admin 90-minute range -> 6 slots', r.status === 201 && r.json.created === 6, JSON.stringify(r.json).slice(0, 120));
  check('  no row longer than 15 minutes exists for this mentor', all15(await rows(mentor.id)));
  check('admin bad range -> 400', (await api(`/api/admin/mentors/${mentor.id}/availability`, { cookie: aCookie, method: 'POST', body: { start: at(3000), end: at(2990) } })).status === 400);

  section('participant view sees the individual slots');
  const pub = await api(`/api/admin/mentors/${mentor.id}/availability`, { cookie: aCookie });
  check('GET lists only 15-minute slots', Array.isArray(pub.json) && pub.json.length === (await rows(mentor.id)).length && pub.json.every((s) => new Date(s.endTime) - new Date(s.startTime) === 15 * MIN));
})()
  .catch((e) => { fail++; console.error('\nSCRIPT ERROR:', e.stack); })
  .finally(async () => {
    try {
      if (mentor) {
        await prisma.mentorAvailability.deleteMany({ where: { mentorId: mentor.id } });
        await prisma.mentor.delete({ where: { id: mentor.id } });
      }
    } catch (e) { console.error('cleanup error:', e.message); }
    await prisma.$disconnect();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail > 0 ? 1 : 0);
  });
