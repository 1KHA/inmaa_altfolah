/**
 * e2e — admin edits a team member's / leader's profile from the teams page.
 *
 * POST /api/admin/update-participant:
 *   - admin may edit any participant's profile fields, including fullName;
 *   - protected fields (status, teamId, isLeader, passwordHash, isDisabled,
 *     phase…) and unknown keys are ignored, never 500;
 *   - duplicate email → 409, bad email → 400, unknown id → 404;
 *   - team leader path unchanged: may edit own team member (fullName still
 *     not applied for leaders), other team → 403, unauthenticated → 401.
 */
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const TAG = `medit${Date.now()}`;

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? '  -> ' + detail : ''}`); } };
const section = (s) => console.log(`\n--- ${s} ---`);
const cookie = (c) => 'token=' + jwt.sign(c, SECRET, { expiresIn: '30m' });
async function api(pathname, { cookie: ck, method = 'GET', body } = {}) {
  const res = await fetch(BASE + pathname, { method, headers: { ...(ck ? { cookie: ck } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
const made = { teams: [], participants: [] };
const MAILPIT = process.env.MAILPIT_URL || 'http://localhost:8025';
const mp = async (p) => (await fetch(MAILPIT + p)).json();
const clearMp = () => fetch(MAILPIT + '/api/v1/messages', { method: 'DELETE' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function mailFor(addr) { return (await mp(`/api/v1/search?query=${encodeURIComponent('to:' + addr)}&limit=10`)).messages || []; }
async function mailText(id) { const m = await mp('/api/v1/message/' + id); return (m.Text || '') + '\n' + (m.HTML || ''); }
const passwordIn = (t) => (/كلمة المرور:\s*([A-Za-z0-9]{10})/.exec(t || '') || [])[1];
let savedSettings = null, settingsId = null;

(async () => {
  if (!SECRET) throw new Error('JWT_SECRET required');
  const admin = await prisma.admin.findFirst();
  const aCookie = cookie({ id: admin.id, username: admin.username, role: 'admin' });
  const settings = await prisma.emailSettings.findFirst();
  settingsId = settings.id; savedSettings = { ...settings }; delete savedSettings.id; delete savedSettings.updatedAt;
  await prisma.emailSettings.update({ where: { id: settings.id }, data: { enabled: true, host: 'localhost', port: 1025, secure: false, username: '', password: '', fromEmail: 'noreply@example.test', fromName: 'E2E', adminInboxEmail: '' } });
  await clearMp();

  const team = await prisma.team.create({ data: { teamName: `${TAG} team`, status: 'approved' } }); made.teams.push(team.id);
  const other = await prisma.team.create({ data: { teamName: `${TAG} other`, status: 'approved' } }); made.teams.push(other.id);
  const leader = await prisma.participant.create({ data: { email: `${TAG}-leader@e2e.test`, fullName: 'Leader', teamId: team.id, isLeader: true, status: 'approved', passwordHash: 'hash-leader' } });
  const member = await prisma.participant.create({ data: { email: `${TAG}-member@e2e.test`, fullName: 'Member One', teamId: team.id, status: 'approved', passwordHash: 'hash-member', phoneNumber: '0500000000', city: 'الرياض' } });
  const stranger = await prisma.participant.create({ data: { email: `${TAG}-stranger@e2e.test`, fullName: 'Stranger', teamId: other.id, isLeader: true, status: 'approved' } });
  made.participants.push(leader.id, member.id, stranger.id);
  const lCookie = cookie({ id: leader.id, participantId: leader.id, role: 'participant' });

  section('changing the email sends credentials to the NEW address + a notice to the OLD one');
  const oldEmail = member.email;
  const oldHash = (await prisma.participant.findUnique({ where: { id: member.id } })).passwordHash;
  let r0 = await api('/api/admin/update-participant', { cookie: aCookie, method: 'POST', body: { id: member.id, email: `${TAG}-member-changed@e2e.test` } });
  check('200 with emailChange.credentialsSent=true', r0.status === 200 && r0.json?.emailChange?.credentialsSent === true, JSON.stringify(r0.json?.emailChange));
  await sleep(800);
  const newMail = await mailFor(`${TAG}-member-changed@e2e.test`), oldMail = await mailFor(oldEmail);
  const newText = newMail[0] ? await mailText(newMail[0].ID) : '';
  const pwNew = passwordIn(newText);
  check('  new address got ONE credentials email (new email + password + login link)', newMail.length === 1 && newText.includes(`${TAG}-member-changed@e2e.test`) && !!pwNew && /\/login/.test(newText), `mails=${newMail.length} pw=${!!pwNew}`);
  check('  old address got a notice WITHOUT credentials', oldMail.length === 1 && !passwordIn(await mailText(oldMail[0].ID)), `mails=${oldMail.length}`);
  check('  password was re-issued (hash changed)', (await prisma.participant.findUnique({ where: { id: member.id } })).passwordHash !== oldHash);
  check('  the emailed password logs in with the NEW email', (await api('/api/login', { method: 'POST', body: { email: `${TAG}-member-changed@e2e.test`, password: pwNew || 'x' } })).status === 200);
  check('  dashboard notification created', (await prisma.notification.count({ where: { recipientId: member.id, title: 'تم تحديث بريدك الإلكتروني' } })) === 1);
  await clearMp();
  r0 = await api('/api/admin/update-participant', { cookie: aCookie, method: 'POST', body: { id: member.id, email: `${TAG}-member-changed@e2e.test`, city: 'الدمام' } });
  await sleep(500);
  check('same email (case/whitespace only) + other fields -> no emails, no password change', r0.status === 200 && !r0.json?.emailChange && (await mp('/api/v1/messages?limit=1')).total === 0);
  // put the original email back for the rest of the suite (this itself sends again; ignore)
  await api('/api/admin/update-participant', { cookie: aCookie, method: 'POST', body: { id: member.id, email: oldEmail } });
  await prisma.participant.update({ where: { id: member.id }, data: { passwordHash: 'hash-member' } });
  await sleep(500); await clearMp();

  section('admin edits a member from the team page');
  let r = await api('/api/admin/update-participant', { cookie: aCookie, method: 'POST', body: { id: member.id, fullName: 'Member Edited', email: `  ${TAG}-MEMBER-new@e2e.test `, contactNumber: '0555555555', gender: 'أنثى', city: 'جدة', isUniversityStudent: true, canAttendHackathon: 'true' } });
  check('200 with the public row (no passwordHash)', r.status === 200 && r.json?.id === member.id && !('passwordHash' in (r.json || {})), JSON.stringify(r.json).slice(0, 120));
  let row = await prisma.participant.findUnique({ where: { id: member.id } });
  check('  fullName updated by admin', row.fullName === 'Member Edited', row.fullName);
  check('  email trimmed + lowercased', row.email === `${TAG}-member-new@e2e.test`.toLowerCase(), row.email);
  check('  other profile fields persisted (contactNumber, gender, city, booleans coerced)', row.contactNumber === '0555555555' && row.gender === 'أنثى' && row.city === 'جدة' && row.isUniversityStudent === true && row.canAttendHackathon === true);
  // (this edit changed the email, so a fresh password was issued by design)
  check('  team / role / status untouched; password re-issued because the email changed', row.teamId === team.id && row.isLeader === false && row.status === 'approved' && row.passwordHash !== 'hash-member');
  await sleep(500); await clearMp();

  section('admin edits the leader');
  r = await api('/api/admin/update-participant', { cookie: aCookie, method: 'POST', body: { id: leader.id, fullName: 'Leader Edited', phoneNumber: '0511111111' } });
  row = await prisma.participant.findUnique({ where: { id: leader.id } });
  check('leader profile updated, still the leader', r.status === 200 && row.fullName === 'Leader Edited' && row.phoneNumber === '0511111111' && row.isLeader === true);

  section('protected + unknown fields are ignored, never 500');
  const hashBefore = (await prisma.participant.findUnique({ where: { id: member.id } })).passwordHash;
  r = await api('/api/admin/update-participant', { cookie: aCookie, method: 'POST', body: { id: member.id, city: 'مكة', status: 'rejected', teamId: other.id, isLeader: true, passwordHash: 'pwned', isDisabled: true, phaseStatus: 'failed', badgeCode: 'X', role: 'admin', nonsenseField: 1, team: { id: 'x' } } });
  row = await prisma.participant.findUnique({ where: { id: member.id } });
  check('200 and only city changed', r.status === 200 && row.city === 'مكة' && row.status === 'approved' && row.teamId === team.id && row.isLeader === false && row.passwordHash === hashBefore && row.isDisabled === false && row.phaseStatus === 'active' && row.badgeCode === null, JSON.stringify({ s: row.status, t: row.teamId === team.id, l: row.isLeader, d: row.isDisabled, hashSame: row.passwordHash === hashBefore }));
  r = await api('/api/admin/update-participant', { cookie: aCookie, method: 'POST', body: { id: member.id, status: 'rejected' } });
  check('only protected fields -> 400 (nothing to update)', r.status === 400, `status=${r.status}`);

  section('validation');
  r = await api('/api/admin/update-participant', { cookie: aCookie, method: 'POST', body: { id: member.id, email: stranger.email } });
  check('duplicate email -> 409 with Arabic message', r.status === 409 && /مستخدم/.test(r.json?.error || ''), JSON.stringify(r.json));
  r = await api('/api/admin/update-participant', { cookie: aCookie, method: 'POST', body: { id: member.id, email: 'not-an-email' } });
  check('bad email -> 400', r.status === 400);
  r = await api('/api/admin/update-participant', { cookie: aCookie, method: 'POST', body: { id: 'does-not-exist', city: 'x' } });
  check('unknown id -> 404', r.status === 404, `status=${r.status}`);
  r = await api('/api/admin/update-participant', { cookie: aCookie, method: 'POST', body: { city: 'x' } });
  check('missing id -> 400', r.status === 400);

  section('team-leader path unchanged (and a leader email change also notifies)');
  await clearMp();
  r = await api('/api/admin/update-participant', { cookie: lCookie, method: 'POST', body: { id: member.id, email: `${TAG}-by-leader@e2e.test` } });
  await sleep(800);
  check('leader changes a member email -> credentials sent to the new address', r.status === 200 && (await mailFor(`${TAG}-by-leader@e2e.test`)).length === 1, `status=${r.status}`);
  await api('/api/admin/update-participant', { cookie: aCookie, method: 'POST', body: { id: member.id, email: `${TAG}-member-new@e2e.test` } });
  await sleep(500); await clearMp();
  r = await api('/api/admin/update-participant', { cookie: lCookie, method: 'POST', body: { id: member.id, fullName: 'Leader Renamed Me', contactNumber: '0599999999' } });
  row = await prisma.participant.findUnique({ where: { id: member.id } });
  check('leader edits own member: 200, contactNumber applied', r.status === 200 && row.contactNumber === '0599999999', `status=${r.status}`);
  check('  fullName NOT applied for leaders (historical behaviour kept)', row.fullName === 'Member Edited', row.fullName);
  r = await api('/api/admin/update-participant', { cookie: lCookie, method: 'POST', body: { id: stranger.id, city: 'x' } });
  check('leader editing another team\'s participant -> 403', r.status === 403, `status=${r.status}`);
  r = await api('/api/admin/update-participant', { method: 'POST', body: { id: member.id, city: 'x' } });
  check('unauthenticated -> 401', r.status === 401);
  const mCookie = cookie({ id: member.id, participantId: member.id, role: 'participant' });
  r = await api('/api/admin/update-participant', { cookie: mCookie, method: 'POST', body: { id: leader.id, city: 'x' } });
  check('non-leader member -> 403', r.status === 403);

  section('individual participant (participants page) — same route, same email behaviour');
  const solo = await prisma.participant.create({ data: { email: `${TAG}-solo@e2e.test`, fullName: 'Solo One', status: 'approved', passwordHash: 'hash-solo', city: 'أبها' } }); made.participants.push(solo.id);
  await clearMp();
  r = await api('/api/admin/update-participant', { cookie: aCookie, method: 'POST', body: { id: solo.id, fullName: 'Solo Edited', city: 'تبوك', email: `${TAG}-solo-new@e2e.test`, gender: 'ذكر', isUniversityStudent: false } });
  row = await prisma.participant.findUnique({ where: { id: solo.id } });
  check('individual edited (name/city/gender) with email change -> 200 + credentialsSent', r.status === 200 && r.json?.emailChange?.credentialsSent === true && row.fullName === 'Solo Edited' && row.city === 'تبوك' && row.gender === 'ذكر' && row.teamId === null, JSON.stringify(r.json?.emailChange));
  await sleep(800);
  const soloNew = await mailFor(`${TAG}-solo-new@e2e.test`), soloOld = await mailFor(`${TAG}-solo@e2e.test`);
  const soloPw = passwordIn(soloNew[0] ? await mailText(soloNew[0].ID) : '');
  check('  credentials at the new address (logs in), notice at the old one', soloNew.length === 1 && soloOld.length === 1 && (await api('/api/login', { method: 'POST', body: { email: `${TAG}-solo-new@e2e.test`, password: soloPw || 'x' } })).status === 200, `new=${soloNew.length} old=${soloOld.length}`);
  const pendingSolo = await prisma.participant.create({ data: { email: `${TAG}-pend@e2e.test`, fullName: 'Pending', status: 'pending' } }); made.participants.push(pendingSolo.id);
  await clearMp();
  r = await api('/api/admin/update-participant', { cookie: aCookie, method: 'POST', body: { id: pendingSolo.id, email: `${TAG}-pend-new@e2e.test` } });
  await sleep(500);
  check('pending applicant email change -> no credentials (still no password), notice only to old address', r.status === 200 && r.json?.emailChange?.credentialsSent === false && (await prisma.participant.findUnique({ where: { id: pendingSolo.id } })).passwordHash === null && (await mailFor(`${TAG}-pend-new@e2e.test`)).length === 0, JSON.stringify(r.json?.emailChange));
  await clearMp();

  section('teams API reflects the edit');
  const teams = await api(`/api/admin/teams?search=${encodeURIComponent(TAG)}`, { cookie: aCookie });
  const t = (teams.json || []).find((x) => x.id === team.id);
  check('team list shows the edited member data', !!t && t.participants.some((p) => p.id === member.id && p.fullName === 'Member Edited' && p.city === 'مكة'));
})()
  .catch((e) => { fail++; console.error('\nSCRIPT ERROR:', e.stack); })
  .finally(async () => {
    try {
      if (savedSettings && settingsId) await prisma.emailSettings.update({ where: { id: settingsId }, data: savedSettings });
      await prisma.emailLog.deleteMany({ where: { templateKey: 'emailChanged' } });
      await prisma.notification.deleteMany({ where: { recipientId: { in: made.participants } } });
      await prisma.participant.deleteMany({ where: { id: { in: made.participants } } });
      await prisma.team.deleteMany({ where: { id: { in: made.teams } } });
      await clearMp().catch(() => {});
    } catch (e) { console.error('cleanup error:', e.message); }
    await prisma.$disconnect();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail > 0 ? 1 : 0);
  });
