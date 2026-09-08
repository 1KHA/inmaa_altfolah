/**
 * E2E: pre-uploaded attachment URLs on team registration.
 *
 * Browsers now upload straight to Supabase Storage and send only the public
 * URL (`attachmentPath`) to /api/register-team — see mdfiles/file-uploads.md.
 * This asserts the API stores that URL, rejects non-storage URLs, and still
 * accepts registrations without any attachment. (The raw-file fallback is
 * exercised by the older suites that post multipart forms.)
 */
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const TAG = `e2eup${Date.now()}`;

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { if (ok) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? '  -> ' + d : ''}`); } };
const section = (s) => console.log(`\n--- ${s} ---`);

function registration(suffix, extra = {}) {
  const fd = new FormData();
  fd.set('registrationType', 'team');
  fd.set('isTeamRegistration', 'true');
  fd.set('teamName', `${TAG} فريق ${suffix}`);
  fd.set('hackathonTrack', 'اختبار');
  fd.set('ideaDescription', 'وصف');
  fd.set('hearAboutUs', 'اختبار');
  fd.set('leaderInfo', JSON.stringify({ fullName: 'قائد', email: `${TAG}-${suffix}-lead@example.invalid`, contactNumber: '0500000001', city: 'الرياض', gender: 'ذكر' }));
  fd.set('members', JSON.stringify([{ fullName: 'عضو', email: `${TAG}-${suffix}-m@example.invalid`, contactNumber: '0500000002', city: 'الرياض', gender: 'أنثى' }, { fullName: 'عضوة ثالثة', email: `${TAG}-${suffix}-m@example.invalid-b`, contactNumber: '0500000002', city: 'الرياض', gender: 'أنثى' }]));
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fetch(BASE + '/api/register-team', { method: 'POST', body: fd }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));
}

const STORAGE_URL = 'https://example.supabase.co/storage/v1/object/public/mayda_buk/teams/1700000000_test.pdf';

async function main() {
  section('pre-uploaded attachment URL is stored');
  const ok = await registration('a', { attachmentPath: STORAGE_URL });
  check('registration with attachmentPath -> 2xx', ok.status === 200 || ok.status === 201, `status=${ok.status} ${JSON.stringify(ok.json)}`);
  const teamA = await prisma.team.findFirst({ where: { teamName: `${TAG} فريق a` } });
  check('team.attachmentPath equals the storage URL', teamA?.attachmentPath === STORAGE_URL, String(teamA?.attachmentPath));

  section('non-storage URLs are refused');
  const bad = await registration('b', { attachmentPath: 'https://evil.example/malware.exe' });
  check('arbitrary URL -> 400', bad.status === 400, `status=${bad.status}`);
  check('  no team created', (await prisma.team.findFirst({ where: { teamName: `${TAG} فريق b` } })) === null);

  section('no attachment still works');
  const none = await registration('c');
  check('registration without attachment -> 2xx', none.status === 200 || none.status === 201, `status=${none.status}`);
  const teamC = await prisma.team.findFirst({ where: { teamName: `${TAG} فريق c` } });
  check('team.attachmentPath is null', !!teamC && teamC.attachmentPath === null);
}

main()
  .catch((e) => { fail++; console.error('SUITE ERROR:', e); })
  .finally(async () => {
    try {
      const teams = await prisma.team.findMany({ where: { teamName: { startsWith: TAG } }, select: { id: true } });
      const ids = teams.map((t) => t.id);
      const parts = await prisma.participant.findMany({ where: { OR: [{ teamId: { in: ids } }, { email: { startsWith: TAG } }] }, select: { id: true } });
      const pids = parts.map((p) => p.id);
      await prisma.notification.deleteMany({ where: { OR: [{ recipientId: { in: pids } }, { relatedEntityId: { in: ids } }] } });
      await prisma.teamJoinRequest.deleteMany({ where: { OR: [{ teamId: { in: ids } }, { participantId: { in: pids } }] } });
      await prisma.participant.deleteMany({ where: { id: { in: pids } } });
      await prisma.team.deleteMany({ where: { id: { in: ids } } });
    } catch (e) { console.error('cleanup error:', e.message); }
    await prisma.$disconnect();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail > 0 ? 1 : 0);
  });
