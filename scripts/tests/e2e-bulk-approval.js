/**
 * e2e — bulk acceptance of teams / individual participants.
 *
 * Verifies, against the real HTTP API + Mailpit (localhost:1025/8025):
 *   - selection and "accept all" jobs approve only pending, enabled rows;
 *     approved / rejected / disabled rows and their credentials are untouched;
 *   - every member gets exactly ONE email carrying their OWN password, which
 *     logs them in; nothing is sent inline, everything goes through the queue;
 *   - the queue wipes the rendered body after delivery;
 *   - re-running "accept all" is a no-op; two chunk workers on the same job
 *     never double-approve or double-send;
 *   - endpoints are admin-only.
 *
 * Needs: JWT_SECRET, VERIFY_BASE_URL (prod build on :3002), DATABASE_URL.
 */
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const bcrypt = require(path.join(REPO, 'node_modules/bcryptjs'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const MAILPIT = process.env.MAILPIT_URL || 'http://localhost:8025';
const TAG = `bulk${Date.now()}`;
const TEAMS = Number(process.env.BULK_TEAMS || 120); // pending teams to create (×3 members)
const SOLOS = Number(process.env.BULK_SOLOS || 40);

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? '  -> ' + detail : ''}`); } };
const section = (s) => console.log(`\n--- ${s} ---`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cookie = (c) => 'token=' + jwt.sign(c, SECRET, { expiresIn: '30m' });

async function api(pathname, { cookie: ck, method = 'GET', body } = {}) {
  const res = await fetch(BASE + pathname, {
    method,
    headers: { ...(ck ? { cookie: ck } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
const mp = async (p) => (await fetch(MAILPIT + p)).json();
const clearMp = () => fetch(MAILPIT + '/api/v1/messages', { method: 'DELETE' });
const mpTotal = async () => (await mp('/api/v1/messages?limit=1')).total;
async function mailFor(addr) {
  const d = await mp(`/api/v1/search?query=${encodeURIComponent('to:' + addr)}&limit=10`);
  return d.messages || [];
}
async function mailText(id) { const m = await mp('/api/v1/message/' + id); return (m.Text || '') + '\n' + (m.HTML || ''); }
const passwordIn = (text) => (/كلمة المرور:\s*([A-Za-z0-9]{10})/.exec(text) || [])[1];

/** Drive a job to completion: approvals loop, then drain loop. */
async function runJob(aCookie, body) {
  let p = (await api('/api/admin/bulk-approve', { cookie: aCookie, method: 'POST', body })).json;
  let calls = 1;
  while (p && !p.done) { p = (await api('/api/admin/bulk-approve', { cookie: aCookie, method: 'POST', body: { jobId: p.jobId } })).json; calls++; }
  return { progress: p, calls };
}
// Mirrors the UI loop: add a drain worker, poll, stop when no row is open or
// nothing moves while no worker holds rows (retry backoff).
async function drainAll(aCookie, jobId) {
  let drains = 0, last, idle = 0;
  let p = (await api(`/api/admin/bulk-approve?jobId=${jobId}`, { cookie: aCookie })).json;
  for (let i = 0; i < 400; i++) {
    if (p.emails.pending + p.emails.sending === 0) return { progress: p, drains, last };
    const before = p.emails.sent + p.emails.failed;
    const r = await api('/api/admin/email-queue/drain', { cookie: aCookie, method: 'POST' });
    drains++; last = r.json;
    if (r.json?.stoppedBy === 'email-disabled') { p = (await api(`/api/admin/bulk-approve?jobId=${jobId}`, { cookie: aCookie })).json; return { progress: p, drains, last }; }
    await sleep(700);
    p = (await api(`/api/admin/bulk-approve?jobId=${jobId}`, { cookie: aCookie })).json;
    idle = (p.emails.sent + p.emails.failed !== before) || p.emails.sending > 0 ? 0 : idle + 1;
    if (idle >= 6) return { progress: p, drains, last };
  }
  return { progress: p, drains, last };
}

const made = { teams: [], participants: [], jobs: [] };
let savedSettings = null, settingsId = null;

async function mkTeam(n, status = 'pending', extra = {}) {
  const t = await prisma.team.create({ data: { teamName: `${TAG} team ${n}`, status, ...extra } });
  made.teams.push(t.id);
  const members = [];
  for (let i = 0; i < 3; i++) {
    const p = await prisma.participant.create({ data: { email: `${TAG}-t${n}-m${i}@e2e.test`, fullName: `T${n} M${i}`, teamId: t.id, isLeader: i === 0, status: status === 'approved' ? 'approved' : 'pending', passwordHash: status === 'approved' ? 'keep-this-hash' : null } });
    made.participants.push(p.id); members.push(p);
  }
  return { team: t, members };
}

(async () => {
  if (!SECRET) throw new Error('JWT_SECRET required');
  const admin = await prisma.admin.findFirst();
  const aCookie = cookie({ id: admin.id, username: admin.username, role: 'admin' });
  const settings = await prisma.emailSettings.findFirst();
  settingsId = settings.id;
  savedSettings = { ...settings }; delete savedSettings.id; delete savedSettings.updatedAt;
  await prisma.emailSettings.update({ where: { id: settings.id }, data: { enabled: true, host: 'localhost', port: 1025, secure: false, username: '', password: '', fromEmail: 'noreply@example.test', fromName: 'E2E', adminInboxEmail: '' } });
  await clearMp();

  // ---------- fixtures ----------
  section(`fixtures: ${TEAMS} pending teams ×3, 5 approved, 2 disabled-pending, ${SOLOS} pending solos`);
  const pendingTeams = [];
  for (let n = 0; n < TEAMS; n++) pendingTeams.push(await mkTeam(n));
  const approvedTeams = [];
  for (let n = 0; n < 5; n++) approvedTeams.push(await mkTeam(`a${n}`, 'approved'));
  const disabledTeams = [];
  for (let n = 0; n < 2; n++) disabledTeams.push(await mkTeam(`d${n}`, 'pending', { isDisabled: true }));
  // A previously approved team's rejected sibling
  const rejected = await prisma.team.create({ data: { teamName: `${TAG} rejected`, status: 'rejected' } }); made.teams.push(rejected.id);
  const solos = [];
  for (let n = 0; n < SOLOS; n++) {
    const hasPw = n % 4 === 0;
    const p = await prisma.participant.create({ data: { email: `${TAG}-solo${n}@e2e.test`, fullName: `Solo ${n}`, status: 'pending', passwordHash: hasPw ? await bcrypt.hash('keepme123', 10) : null } });
    made.participants.push(p.id); solos.push({ p, hasPw });
  }
  const approvedSolo = await prisma.participant.create({ data: { email: `${TAG}-solo-ok@e2e.test`, fullName: 'Solo ok', status: 'approved', passwordHash: 'solo-keep' } }); made.participants.push(approvedSolo.id);
  const hashesBefore = new Map((await prisma.participant.findMany({ where: { id: { in: made.participants } }, select: { id: true, passwordHash: true } })).map((r) => [r.id, r.passwordHash]));
  check('fixtures created', pendingTeams.length === TEAMS && solos.length === SOLOS);

  // ---------- auth ----------
  section('auth');
  check('GET bulk-approve without admin -> 401', (await api('/api/admin/bulk-approve?target=teams')).status === 401);
  check('POST bulk-approve as participant -> 401', (await api('/api/admin/bulk-approve', { cookie: cookie({ id: solos[0].p.id, participantId: solos[0].p.id, role: 'participant' }), method: 'POST', body: { target: 'teams' } })).status === 401);
  check('POST drain without admin -> 401', (await api('/api/admin/email-queue/drain', { method: 'POST' })).status === 401);
  check('bad target -> 400', (await api('/api/admin/bulk-approve', { cookie: aCookie, method: 'POST', body: { target: 'x' } })).status === 400);

  // ---------- selection job ----------
  section('selection: 10 ids (8 pending + 1 approved + 1 rejected)');
  const selIds = [...pendingTeams.slice(0, 8).map((t) => t.team.id), approvedTeams[0].team.id, rejected.id];
  const cnt = (await api(`/api/admin/bulk-approve?target=teams&ids=${selIds.join(',')}`, { cookie: aCookie })).json;
  check('pending count for the selection = 8', cnt?.pending === 8, JSON.stringify(cnt));
  const sel = await runJob(aCookie, { target: 'teams', ids: selIds });
  made.jobs.push(sel.progress.jobId);
  check('job done: approved=8, skipped=2, failed=0', sel.progress.done && sel.progress.approved === 8 && sel.progress.skipped === 2 && sel.progress.failed === 0, JSON.stringify(sel.progress));
  check('  24 credential emails queued (8 teams × 3)', sel.progress.emails.total === 24, String(sel.progress.emails.total));
  const rowsQ = await prisma.broadcastRecipient.findMany({ where: { broadcastId: sel.progress.jobId } });
  check('  queue rows carry per-recipient subject/body', rowsQ.length === 24 && rowsQ.every((r) => r.body && r.subject && r.body.includes(r.email)), rowsQ[0] && rowsQ[0].body?.slice(0, 60));
  check('  nothing was sent inline (Mailpit still empty)', (await mpTotal()) === 0);
  check('  approved team unchanged (still approved, members keep hash)', (await prisma.participant.findMany({ where: { teamId: approvedTeams[0].team.id } })).every((p) => p.passwordHash === 'keep-this-hash'));
  check('  rejected team still rejected', (await prisma.team.findUnique({ where: { id: rejected.id } })).status === 'rejected');
  check('  dashboard notifications created for the 24 members', (await prisma.notification.count({ where: { relatedEntityType: 'team', relatedEntityId: { in: pendingTeams.slice(0, 8).map((t) => t.team.id) }, recipientType: 'participant' } })) === 24);

  const d1 = await drainAll(aCookie, sel.progress.jobId);
  check('drain delivers all 24 (sent=24, failed=0)', d1.progress.emails.sent === 24 && d1.progress.emails.failed === 0 && ['completed', 'partial'].includes(d1.progress.emails.status), JSON.stringify(d1.progress.emails));
  await sleep(500);
  check('  Mailpit received exactly 24 messages', (await mpTotal()) === 24, String(await mpTotal()));
  const m0 = pendingTeams[0].members[1];
  const mails0 = await mailFor(m0.email);
  const text0 = mails0[0] ? await mailText(mails0[0].ID) : '';
  const pw0 = passwordIn(text0);
  check('  member email is individual (to: them) with a 10-char password', mails0.length === 1 && mails0[0].To.length === 1 && !!pw0, `mails=${mails0.length} pw=${pw0}`);
  const login0 = await api('/api/login', { method: 'POST', body: { email: m0.email, password: pw0 || 'x' } });
  check('  that password logs the member in', login0.status === 200, `status=${login0.status}`);
  const leaderMail = await mailFor(pendingTeams[0].members[0].email);
  const pwLeader = passwordIn(leaderMail[0] ? await mailText(leaderMail[0].ID) : '');
  check('  each member got a DIFFERENT password', !!pwLeader && pwLeader !== pw0);
  const rowsAfter = await prisma.broadcastRecipient.findMany({ where: { broadcastId: sel.progress.jobId } });
  check('  rendered body wiped from sent rows', rowsAfter.every((r) => r.status === 'sent' && r.body === null && r.subject === null));
  check('  notifications stamped emailStatus=sent', (await prisma.notification.count({ where: { relatedEntityId: { in: pendingTeams.slice(0, 8).map((t) => t.team.id) }, emailStatus: 'sent' } })) === 24);

  // ---------- accept ALL teams ----------
  section(`accept all pending teams (${TEAMS - 8} remain; 2 disabled must be skipped)`);
  await clearMp();
  const all = await runJob(aCookie, { target: 'teams' });
  made.jobs.push(all.progress.jobId);
  const expect = TEAMS - 8;
  check(`job done in ${all.calls} chunk calls: approved=${expect}`, all.progress.done && all.progress.approved === expect && all.progress.failed === 0, JSON.stringify(all.progress));
  check('  disabled pending teams NOT approved', (await prisma.team.count({ where: { id: { in: disabledTeams.map((t) => t.team.id) }, status: 'pending' } })) === 2);
  check('  no pending enabled team left among fixtures', (await prisma.team.count({ where: { id: { in: made.teams }, status: 'pending', isDisabled: false } })) === 0);
  const d2 = await drainAll(aCookie, all.progress.jobId);
  check(`  ${expect * 3} emails delivered, 0 failed (drain calls=${d2.drains})`, d2.progress.emails.total === expect * 3 && d2.progress.emails.sent === expect * 3 && d2.progress.emails.failed === 0, JSON.stringify(d2.progress.emails));
  await sleep(500);
  const total2 = await mpTotal();
  check(`  Mailpit received exactly ${expect * 3} messages (one per member, no duplicates)`, total2 === expect * 3, String(total2));
  // spot-check the last team's member
  const lastM = pendingTeams[TEAMS - 1].members[2];
  const lm = await mailFor(lastM.email);
  const lpw = passwordIn(lm[0] ? await mailText(lm[0].ID) : '');
  check('  last team member can log in with the emailed password', lm.length === 1 && (await api('/api/login', { method: 'POST', body: { email: lastM.email, password: lpw || 'x' } })).status === 200);
  const hashesAfter = new Map((await prisma.participant.findMany({ where: { id: { in: made.participants } }, select: { id: true, passwordHash: true } })).map((r) => [r.id, r.passwordHash]));
  const untouched = [...approvedTeams.flatMap((t) => t.members), ...disabledTeams.flatMap((t) => t.members), approvedSolo, ...solos.map((s) => s.p)];
  check('  approved/disabled teams and all solos: password hashes untouched', untouched.every((p) => hashesAfter.get(p.id) === hashesBefore.get(p.id)));

  section('idempotency: accept all again');
  const again = await runJob(aCookie, { target: 'teams' });
  made.jobs.push(again.progress.jobId);
  check('second run: requested=0, done, no emails', again.progress.done && again.progress.requested === 0 && again.progress.emails.total === 0, JSON.stringify(again.progress));

  // ---------- individuals ----------
  section(`accept all pending individual participants (${SOLOS})`);
  await clearMp();
  const solo = await runJob(aCookie, { target: 'participants' });
  made.jobs.push(solo.progress.jobId);
  check(`approved=${SOLOS}, skipped=0`, solo.progress.done && solo.progress.approved === SOLOS && solo.progress.skipped === 0, JSON.stringify(solo.progress));
  check('  team members were NOT touched by the participants job', (await prisma.participant.count({ where: { id: { in: disabledTeams.flatMap((t) => t.members.map((m) => m.id)) }, status: 'pending' } })) === 6);
  const d3 = await drainAll(aCookie, solo.progress.jobId);
  check(`  ${SOLOS} emails delivered`, d3.progress.emails.sent === SOLOS && d3.progress.emails.failed === 0, JSON.stringify(d3.progress.emails));
  const withPw = solos.find((s) => s.hasPw), noPw = solos.find((s) => !s.hasPw);
  const hashesSolo = new Map((await prisma.participant.findMany({ where: { id: { in: solos.map((s) => s.p.id) } }, select: { id: true, passwordHash: true } })).map((r) => [r.id, r.passwordHash]));
  check('  solo WITH an existing password keeps it and gets the "unchanged" text', hashesSolo.get(withPw.p.id) === hashesBefore.get(withPw.p.id) && /لم تتغير/.test(await mailText((await mailFor(withPw.p.email))[0].ID)));
  const noPwText = await mailText((await mailFor(noPw.p.email))[0].ID);
  check('  solo WITHOUT a password gets one that logs in', (await api('/api/login', { method: 'POST', body: { email: noPw.p.email, password: passwordIn(noPwText) || 'x' } })).status === 200);

  // ---------- concurrency ----------
  section('two workers on the same job never double-approve or double-send');
  const cTeams = [];
  for (let n = 0; n < 12; n++) cTeams.push(await mkTeam(`c${n}`));
  const first = (await api('/api/admin/bulk-approve', { cookie: aCookie, method: 'POST', body: { target: 'teams', ids: cTeams.map((t) => t.team.id) } })).json;
  made.jobs.push(first.jobId);
  let p = first;
  while (!p.done) {
    const [a, b] = await Promise.all([
      api('/api/admin/bulk-approve', { cookie: aCookie, method: 'POST', body: { jobId: first.jobId } }),
      api('/api/admin/bulk-approve', { cookie: aCookie, method: 'POST', body: { jobId: first.jobId } }),
    ]);
    p = a.json.done ? a.json : b.json;
    if (!p.done) p = (await api(`/api/admin/bulk-approve?jobId=${first.jobId}`, { cookie: aCookie })).json;
  }
  const cApproved = await prisma.team.count({ where: { id: { in: cTeams.map((t) => t.team.id) }, status: 'approved' } });
  const cRows = await prisma.broadcastRecipient.count({ where: { broadcastId: first.jobId } });
  check('all 12 approved once; exactly 36 queue rows (unique per email)', cApproved === 12 && cRows === 36, `approved=${cApproved} rows=${cRows}`);
  check('  36 notifications, none duplicated', (await prisma.notification.count({ where: { relatedEntityType: 'team', relatedEntityId: { in: cTeams.map((t) => t.team.id) } } })) === 36);

  section('history + email disabled behaviour');
  const hist = (await api('/api/admin/broadcast', { cookie: aCookie })).json;
  const list = Array.isArray(hist) ? hist : hist?.broadcasts || [];
  check('bulk jobs appear in the broadcast history', list.some((b) => b.id === all.progress.jobId));
  await prisma.emailSettings.update({ where: { id: settings.id }, data: { enabled: false } });
  const dOff = (await api('/api/admin/email-queue/drain', { cookie: aCookie, method: 'POST' })).json;
  check('drain with email disabled parks rows (stoppedBy=email-disabled or empty)', ['email-disabled', 'empty'].includes(dOff?.stoppedBy), JSON.stringify(dOff));
  await prisma.emailSettings.update({ where: { id: settings.id }, data: { enabled: true } });
  const dOn = await drainAll(aCookie, first.jobId);
  check('  re-enabled: the 36 concurrency-job emails are delivered', dOn.progress.emails.sent === 36, JSON.stringify(dOn.progress.emails));
})()
  .catch((e) => { fail++; console.error('\nSCRIPT ERROR:', e.stack); })
  .finally(async () => {
    try {
      if (savedSettings && settingsId) await prisma.emailSettings.update({ where: { id: settingsId }, data: savedSettings });
      // Leave the inbox empty for the suites that run after this one.
      await clearMp().catch(() => {});
      await prisma.broadcastRecipient.deleteMany({ where: { broadcastId: { in: made.jobs } } });
      await prisma.broadcast.deleteMany({ where: { id: { in: made.jobs } } });
      await prisma.emailLog.deleteMany({ where: { OR: [{ broadcastId: { in: made.jobs } }, { templateKey: { in: ['teamApproval', 'participantApproval'] } }] } });
      await prisma.notification.deleteMany({ where: { OR: [{ recipientId: { in: made.participants } }, { relatedEntityId: { in: [...made.teams, ...made.participants] } }] } });
      await prisma.participant.deleteMany({ where: { id: { in: made.participants } } });
      await prisma.team.deleteMany({ where: { id: { in: made.teams } } });
    } catch (e) { console.error('cleanup error:', e.message); }
    await prisma.$disconnect();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail > 0 ? 1 : 0);
  });
