/**
 * ATT Phase 1 e2e: badge generation API + page.
 */
const path = require('path');
const REPO = '/Users/kha/Documents/Code/dyam_hackathon/dhwmk_alvira';
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const TAG = `att1-${Date.now()}`;

let pass = 0, fail = 0;
const made = { participants: [], teams: [] };

function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  -> ' + detail : ''}`); }
}

async function api(p, { cookie } = {}) {
  const res = await fetch(BASE + p, { headers: cookie ? { cookie } : {} });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
const pCookie = (id) => 'token=' + jwt.sign({ id, participantId: id, role: 'participant' }, SECRET, { expiresIn: '30m' });

async function main() {
  const admin = await prisma.admin.findFirst();
  const team = await prisma.team.create({ data: { teamName: `${TAG} فريق`, status: 'approved', isTeamRegistration: true } });
  made.teams.push(team.id);
  const p1 = await prisma.participant.create({ data: { email: `${TAG}-p1@t.test`, fullName: 'مشارك أول', teamId: team.id } });
  const p2 = await prisma.participant.create({ data: { email: `${TAG}-p2@t.test`, fullName: 'مشارك ثاني' } });
  made.participants.push(p1.id, p2.id);

  check('badge API without token -> 401', (await api('/api/participant/badge')).status === 401);
  check('badge API with ADMIN token -> 401',
    (await api('/api/participant/badge', { cookie: 'token=' + jwt.sign({ id: admin.id, username: admin.username, role: 'admin' }, SECRET, { expiresIn: '10m' }) })).status === 401);
  check('badge API with MENTOR token -> 401',
    (await api('/api/participant/badge', { cookie: 'token=' + jwt.sign({ id: 'x', mentorId: 'x', role: 'mentor' }, SECRET, { expiresIn: '10m' }) })).status === 401);

  const first = await api('/api/participant/badge', { cookie: pCookie(p1.id) });
  check('first call returns 200 with an INMAA- code',
    first.status === 200 && /^INMAA-[A-Z2-9]{12}$/.test(first.json.badgeCode), JSON.stringify(first.json));
  check('  carries name and team', first.json.fullName === 'مشارك أول' && first.json.teamName === `${TAG} فريق`);

  const dbRow = await prisma.participant.findUnique({ where: { id: p1.id }, select: { badgeCode: true } });
  check('code persisted in DB', dbRow.badgeCode === first.json.badgeCode);

  const second = await api('/api/participant/badge', { cookie: pCookie(p1.id) });
  check('second call returns the SAME code (stable)', second.json.badgeCode === first.json.badgeCode);

  const other = await api('/api/participant/badge', { cookie: pCookie(p2.id) });
  check('another participant gets a DISTINCT code',
    other.status === 200 && other.json.badgeCode !== first.json.badgeCode);
  check('  solo participant has teamName null', other.json.teamName === null);

  // A code issued under the old MAYDA- prefix is replaced on the next read
  await prisma.participant.update({ where: { id: p2.id }, data: { badgeCode: 'MAYDA-LEGACYCODE23' } });
  const upgraded = await api('/api/participant/badge', { cookie: pCookie(p2.id) });
  const upgradedRow = await prisma.participant.findUnique({ where: { id: p2.id }, select: { badgeCode: true } });
  check('legacy MAYDA- code is replaced with a new INMAA- code (returned and persisted)',
    upgraded.status === 200 && /^INMAA-[A-Z2-9]{12}$/.test(upgraded.json.badgeCode) && upgradedRow.badgeCode === upgraded.json.badgeCode,
    JSON.stringify({ api: upgraded.json.badgeCode, db: upgradedRow.badgeCode }));

  const page = await fetch(BASE + '/participant-dashboard/badge');
  check('badge page responds 200', page.status === 200, `status=${page.status}`);
}

main()
  .catch((e) => { fail++; console.error('SCRIPT ERROR:', e.stack); })
  .finally(async () => {
    await prisma.participant.deleteMany({ where: { id: { in: made.participants } } });
    await prisma.team.deleteMany({ where: { id: { in: made.teams } } });
    console.log(`\n${pass} passed, ${fail} failed`);
    await prisma.$disconnect();
    process.exit(fail === 0 ? 0 : 1);
  });
