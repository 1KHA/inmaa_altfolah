/**
 * e2e — admin changes the team leader; admin re-enables accounts and the
 * members receive NEW login credentials.
 *
 * Leader change (POST /api/admin/update-team { teamId, newLeaderId }):
 *   flags swap in the DB, the new leader can use leader-only APIs at once
 *   (DB-based checks — even with an old JWT), the old leader cannot, the team
 *   is notified.
 * Re-enable (POST /api/admin/accounts/disable { …, disabled:false }):
 *   approved members of a re-enabled team / re-enabled individuals get a fresh
 *   password + queued email (Mailpit), the emailed password logs in; members
 *   individually disabled, pending participants, and `sendCredentials:false`
 *   leave hashes untouched. Disabling never touches credentials.
 */
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const MAILPIT = process.env.MAILPIT_URL || 'http://localhost:8025';
const TAG = `lead${Date.now()}`;

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? '  -> ' + detail : ''}`); } };
const section = (s) => console.log(`\n--- ${s} ---`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cookie = (c) => 'token=' + jwt.sign(c, SECRET, { expiresIn: '30m' });
const pCookie = (p, isLeader) => cookie({ id: p.id, participantId: p.id, email: p.email, role: 'participant', teamId: p.teamId, isLeader });
async function api(pathname, { cookie: ck, method = 'GET', body } = {}) {
  const res = await fetch(BASE + pathname, { method, headers: { ...(ck ? { cookie: ck } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
const mp = async (p) => (await fetch(MAILPIT + p)).json();
const clearMp = () => fetch(MAILPIT + '/api/v1/messages', { method: 'DELETE' });
async function mailFor(addr) { return (await mp(`/api/v1/search?query=${encodeURIComponent('to:' + addr)}&limit=10`)).messages || []; }
async function mailText(id) { const m = await mp('/api/v1/message/' + id); return (m.Text || '') + '\n' + (m.HTML || ''); }
const passwordIn = (t) => (/كلمة المرور:\s*([A-Za-z0-9]{10})/.exec(t || '') || [])[1];
async function drainUntilQuiet(aCookie) {
  for (let i = 0; i < 20; i++) {
    const r = await api('/api/admin/email-queue/drain', { cookie: aCookie, method: 'POST' });
    if (r.json && r.json.remaining === 0) { await sleep(300); return; }
    await sleep(500);
  }
}
const hashOf = async (id) => (await prisma.participant.findUnique({ where: { id }, select: { passwordHash: true } })).passwordHash;

const made = { teams: [], participants: [], jobs: [] };
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
  const mk = async (name, extra = {}) => { const p = await prisma.participant.create({ data: { email: `${TAG}-${name}@e2e.test`, fullName: `${TAG} ${name}`, status: 'approved', passwordHash: `hash-${name}`, ...extra } }); made.participants.push(p.id); return p; };
  const leader = await mk('leader', { teamId: team.id, isLeader: true });
  const member = await mk('member', { teamId: team.id });
  const offMember = await mk('offmember', { teamId: team.id, isDisabled: true, disabledAt: new Date() });
  const solo = await mk('solo');
  const soloPending = await mk('solopending', { status: 'pending', passwordHash: null });

  // ================= leader change =================
  section('admin makes a member the leader');
  let r = await api('/api/admin/update-team', { cookie: aCookie, method: 'POST', body: { teamId: team.id, newLeaderId: member.id } });
  check('update-team 200', r.status === 200, `status=${r.status} ${JSON.stringify(r.json).slice(0, 100)}`);
  const rows = await prisma.participant.findMany({ where: { teamId: team.id }, select: { id: true, isLeader: true } });
  check('exactly one leader, and it is the new one', rows.filter((x) => x.isLeader).length === 1 && rows.find((x) => x.id === member.id).isLeader === true && rows.find((x) => x.id === leader.id).isLeader === false);
  // Leader-only API that reads the DB: the new leader (even with an OLD token saying isLeader:false) works; old leader (token still says isLeader:true) is refused
  r = await api('/api/participant/update-team', { cookie: pCookie(member, false), method: 'POST', body: { ideaName: `${TAG} idea by new leader` } });
  check('new leader can edit the team immediately (DB-based check, stale token)', r.status === 200, `status=${r.status} ${JSON.stringify(r.json).slice(0, 120)}`);
  r = await api('/api/participant/update-team', { cookie: pCookie(leader, true), method: 'POST', body: { ideaName: 'hijack' } });
  check('old leader is refused even though the JWT still says isLeader', r.status === 403, `status=${r.status}`);
  r = await api('/api/participant/add-member', { cookie: pCookie(leader, true), method: 'POST', body: { email: `${TAG}-x@e2e.test`, fullName: 'x' } });
  check('old leader cannot add members (add-member now checks the DB)', r.status === 403 && /leader/i.test(r.json?.error || ''), `status=${r.status} ${r.json?.error}`);
  const notif = await prisma.notification.findMany({ where: { relatedEntityType: 'team', relatedEntityId: team.id, title: 'تم تغيير قائد الفريق' } });
  check('team members notified about the new leader (enabled members only)', notif.length === 2 && notif.every((n) => n.message.includes(member.fullName)), `count=${notif.length}`);
  r = await api('/api/admin/update-team', { cookie: aCookie, method: 'POST', body: { teamId: team.id, newLeaderId: solo.id } });
  check('non-member as leader -> 400', r.status === 400);
  r = await api('/api/admin/update-team', { cookie: aCookie, method: 'POST', body: { teamId: team.id, newLeaderId: member.id } });
  check('re-assigning the same leader is a no-op (no extra notification)', r.status === 200 && (await prisma.notification.count({ where: { relatedEntityId: team.id, title: 'تم تغيير قائد الفريق' } })) === 2);

  // ================= disable: no credentials =================
  section('disable never touches credentials');
  await clearMp(); // the leader-change notice above was emailed
  const before = { leader: await hashOf(leader.id), member: await hashOf(member.id), off: await hashOf(offMember.id), solo: await hashOf(solo.id) };
  r = await api('/api/admin/accounts/disable', { cookie: aCookie, method: 'POST', body: { teamIds: [team.id], participantIds: [solo.id], disabled: true } });
  check('disable 200, credentialsIssued=0, no job', r.status === 200 && r.json.credentialsIssued === 0 && r.json.emailJobId === null, JSON.stringify(r.json));
  check('  hashes unchanged', (await hashOf(leader.id)) === before.leader && (await hashOf(solo.id)) === before.solo);
  check('  no email queued', (await mp('/api/v1/messages?limit=1')).total === 0);

  // ================= re-enable team =================
  section('re-enable team → approved, not-individually-disabled members get new credentials');
  r = await api('/api/admin/accounts/disable', { cookie: aCookie, method: 'POST', body: { teamIds: [team.id], disabled: false } });
  check('re-enable 200 with credentialsIssued=2 and an email job', r.status === 200 && r.json.credentialsIssued === 2 && !!r.json.emailJobId, JSON.stringify(r.json));
  if (r.json.emailJobId) made.jobs.push(r.json.emailJobId);
  check('  leader + member got NEW hashes', (await hashOf(leader.id)) !== before.leader && (await hashOf(member.id)) !== before.member);
  check('  individually-disabled member untouched (still disabled, same hash)', (await hashOf(offMember.id)) === before.off && (await prisma.participant.findUnique({ where: { id: offMember.id } })).isDisabled === true);
  await drainUntilQuiet(aCookie);
  const lm = await mailFor(leader.email), mm = await mailFor(member.email), om = await mailFor(offMember.email);
  check('  one reactivation email each for leader and member, none for the disabled member', lm.length === 1 && mm.length === 1 && om.length === 0, `l=${lm.length} m=${mm.length} off=${om.length}`);
  const text = lm[0] ? await mailText(lm[0].ID) : '';
  const pw = passwordIn(text);
  check('  email carries email + password + login link', text.includes(leader.email) && !!pw && /\/login/.test(text));
  check('  the emailed password logs in', (await api('/api/login', { method: 'POST', body: { email: leader.email, password: pw || 'x' } })).status === 200);
  check('  dashboard notification created for them', (await prisma.notification.count({ where: { recipientId: { in: [leader.id, member.id] }, title: 'تم إعادة تفعيل حسابك' } })) === 2);
  const rowsQ = await prisma.broadcastRecipient.findMany({ where: { broadcastId: r.json.emailJobId } });
  check('  queue rows delivered and bodies wiped', rowsQ.length === 2 && rowsQ.every((x) => x.status === 'sent' && x.body === null));

  // ================= re-enable individuals =================
  section('re-enable individuals');
  await clearMp();
  await prisma.participant.updateMany({ where: { id: { in: [solo.id, soloPending.id] } }, data: { isDisabled: true, disabledAt: new Date() } });
  r = await api('/api/admin/accounts/disable', { cookie: aCookie, method: 'POST', body: { participantIds: [solo.id, soloPending.id], disabled: false } });
  if (r.json.emailJobId) made.jobs.push(r.json.emailJobId);
  check('approved solo gets credentials, pending one does not (credentialsIssued=1)', r.status === 200 && r.json.participantsUpdated === 2 && r.json.credentialsIssued === 1, JSON.stringify(r.json));
  check('  pending participant still has no password', (await hashOf(soloPending.id)) === null);
  await drainUntilQuiet(aCookie);
  const sm = await mailFor(solo.email);
  check('  solo email delivered and logs in', sm.length === 1 && (await api('/api/login', { method: 'POST', body: { email: solo.email, password: passwordIn(await mailText(sm[0].ID)) || 'x' } })).status === 200, `mails=${sm.length}`);

  section('sendCredentials:false re-enables silently');
  await clearMp();
  const h = await hashOf(solo.id);
  await prisma.participant.update({ where: { id: solo.id }, data: { isDisabled: true } });
  r = await api('/api/admin/accounts/disable', { cookie: aCookie, method: 'POST', body: { participantIds: [solo.id], disabled: false, sendCredentials: false } });
  check('200, credentialsIssued=0, hash unchanged, no email', r.status === 200 && r.json.credentialsIssued === 0 && (await hashOf(solo.id)) === h && (await mp('/api/v1/messages?limit=1')).total === 0, JSON.stringify(r.json));

  section('re-enabling an already-enabled account issues nothing new');
  r = await api('/api/admin/accounts/disable', { cookie: aCookie, method: 'POST', body: { participantIds: [solo.id], disabled: false } });
  if (r.json.emailJobId) made.jobs.push(r.json.emailJobId);
  const h2 = await hashOf(solo.id);
  check('200 but credentialsIssued=0 and hash unchanged (was not disabled)', r.status === 200 && r.json.credentialsIssued === 0 && r.json.emailJobId === null && h2 === (await hashOf(solo.id)), JSON.stringify(r.json));
})()
  .catch((e) => { fail++; console.error('\nSCRIPT ERROR:', e.stack); })
  .finally(async () => {
    try {
      if (savedSettings && settingsId) await prisma.emailSettings.update({ where: { id: settingsId }, data: savedSettings });
      await prisma.broadcastRecipient.deleteMany({ where: { broadcastId: { in: made.jobs } } });
      await prisma.broadcast.deleteMany({ where: { id: { in: made.jobs } } });
      await prisma.emailLog.deleteMany({ where: { OR: [{ broadcastId: { in: made.jobs } }, { templateKey: { in: ['teamLeaderChanged', 'accountReactivated'] } }] } });
      await prisma.notification.deleteMany({ where: { OR: [{ recipientId: { in: made.participants } }, { relatedEntityId: { in: [...made.teams, ...made.participants] } }] } });
      await prisma.participant.deleteMany({ where: { id: { in: made.participants } } });
      await prisma.team.deleteMany({ where: { id: { in: made.teams } } });
      await clearMp().catch(() => {});
    } catch (e) { console.error('cleanup error:', e.message); }
    await prisma.$disconnect();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail > 0 ? 1 : 0);
  });
