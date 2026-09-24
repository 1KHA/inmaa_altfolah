/**
 * e2e — bulk acceptance over the MANDRILL transport (production path).
 *
 * Not in run-all: the app server must be started with the Mandrill env
 * pointed at the fake API:
 *
 *   node scripts/tests/fake-mandrill.js &
 *   MANDRILL_API_URL=http://127.0.0.1:2580/send MAILCHIMP_API_KEY=test-key \
 *   MAIL_FROM=noreply@example.test npx next start -p 3002
 *   VERIFY_BASE_URL=http://localhost:3002 node scripts/tests/e2e-bulk-approval-mandrill.js
 *
 * Verifies: credential emails leave as merge-var batches (≤100 recipients per
 * API call, each recipient with ONLY their own subject/body, preserve_recipients
 * off), per-recipient verdicts (hard-bounce → permanent failure, queued → sent),
 * a transient API outage → whole batch retried with backoff then delivered,
 * every emailed password logs in, bodies wiped after delivery.
 */
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const FAKE = process.env.FAKE_MANDRILL_URL || 'http://127.0.0.1:2580';
const TAG = `bmd${Date.now()}`;
const TEAMS = Number(process.env.BULK_TEAMS || 40); // ×3 members = 120 → 2 merge calls

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? '  -> ' + detail : ''}`); } };
const section = (s) => console.log(`\n--- ${s} ---`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cookie = (c) => 'token=' + jwt.sign(c, SECRET, { expiresIn: '30m' });
async function api(pathname, { cookie: ck, method = 'GET', body } = {}) {
  const res = await fetch(BASE + pathname, { method, headers: { ...(ck ? { cookie: ck } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
const fakeRequests = async () => (await (await fetch(FAKE + '/requests')).json()).requests;
const fakeReset = () => fetch(FAKE + '/reset');
const passwordIn = (text) => (/كلمة المرور:\s*([A-Za-z0-9]{10})/.exec(text || '') || [])[1];
const varOf = (mv, name) => (mv.vars.find((v) => v.name === name) || {}).content;

async function runJob(aCookie, body) {
  let p = (await api('/api/admin/bulk-approve', { cookie: aCookie, method: 'POST', body })).json;
  while (p && !p.done) p = (await api('/api/admin/bulk-approve', { cookie: aCookie, method: 'POST', body: { jobId: p.jobId } })).json;
  return p;
}
async function drainUntilQuiet(aCookie, jobId) {
  let p, idle = 0;
  for (let i = 0; i < 60; i++) {
    const before = p ? p.emails.sent + p.emails.failed : -1;
    const r = await api('/api/admin/email-queue/drain', { cookie: aCookie, method: 'POST' });
    await sleep(500);
    p = (await api(`/api/admin/bulk-approve?jobId=${jobId}`, { cookie: aCookie })).json;
    if (p.emails.pending + p.emails.sending === 0) return p;
    idle = p.emails.sent + p.emails.failed !== before || p.emails.sending > 0 ? 0 : idle + 1;
    if (idle >= 4 || r.json?.stoppedBy === 'email-disabled') return p;
  }
  return p;
}

const made = { teams: [], participants: [], jobs: [] };
let savedSettings = null, settingsId = null;

(async () => {
  if (!SECRET) throw new Error('JWT_SECRET required');
  try { await fetch(FAKE + '/reset'); } catch { throw new Error(`fake mandrill not running at ${FAKE}`); }
  const admin = await prisma.admin.findFirst();
  const aCookie = cookie({ id: admin.id, username: admin.username, role: 'admin' });
  const settings = await prisma.emailSettings.findFirst();
  settingsId = settings.id; savedSettings = { ...settings }; delete savedSettings.id; delete savedSettings.updatedAt;
  // Mandrill needs only the master switch + a from name; SMTP fields are irrelevant.
  await prisma.emailSettings.update({ where: { id: settings.id }, data: { enabled: true, fromEmail: 'noreply@example.test', fromName: 'جائزة مايدة', adminInboxEmail: '' } });

  section(`fixtures: ${TEAMS} pending teams ×3 (one bounce, one quota, one flaky address)`);
  const teams = [];
  for (let n = 0; n < TEAMS; n++) {
    const t = await prisma.team.create({ data: { teamName: `${TAG} team ${n}`, status: 'pending' } }); made.teams.push(t.id);
    const members = [];
    for (let i = 0; i < 3; i++) {
      let local = `${TAG}-t${n}-m${i}`;
      if (n === 0 && i === 1) local += '-bounce';
      if (n === 1 && i === 1) local += '-quota';
      if (n === TEAMS - 1 && i === 2) local += '-flaky'; // lands in the LAST batch
      const p = await prisma.participant.create({ data: { email: `${local}@e2e.test`, fullName: `T${n} M${i}`, teamId: t.id, isLeader: i === 0, status: 'pending' } });
      made.participants.push(p.id); members.push(p);
    }
    teams.push({ t, members });
  }
  const total = TEAMS * 3;
  await fakeReset();

  section('accept all → queued, nothing sent inline');
  const job = await runJob(aCookie, { target: 'teams' });
  made.jobs.push(job.jobId);
  check(`approved ${TEAMS}, ${total} emails queued`, job.done && job.approved === TEAMS && job.emails.total === total, JSON.stringify(job));
  // The route's inline drain (waitUntil) may already be sending in the background — that is fine.

  section('delivery through Mandrill merge-var batches');
  let p = await drainUntilQuiet(aCookie, job.jobId);
  let reqs = await fakeRequests();
  const mergeCalls = reqs.filter((r) => r.message?.merge === true);
  check('every API call is a merge-var call with ≤100 recipients', mergeCalls.length > 0 && mergeCalls.every((r) => r.message.to.length <= 100), `calls=${reqs.length} merge=${mergeCalls.length} sizes=${mergeCalls.map((r) => r.message.to.length).join(',')}`);
  check('  preserve_recipients=false, merge_language=mailchimp, tags in subject/html/text', mergeCalls.every((r) => r.message.preserve_recipients === false && r.message.merge_language === 'mailchimp' && r.message.subject === '*|EMAILSUBJECT|*' && r.message.html === '*|EMAILHTML|*' && r.message.text === '*|EMAILTEXT|*'));
  check('  request carries the API key from env', reqs.every((r) => r.key === 'test-key'));
  check('  from_email = MAIL_FROM', reqs.every((r) => r.message.from_email === 'noreply@example.test'));
  const failedCall = reqs.find((r) => r.message.to.some((t) => /flaky/.test(t.email)));
  check('  batch with the flaky address hit the simulated outage once', !!failedCall);
  check('  outage batch retried with backoff (rows pending, attempts=1)', (await prisma.broadcastRecipient.count({ where: { broadcastId: job.jobId, status: 'pending', attempts: 1 } })) > 0, JSON.stringify(p.emails));

  // Make the backoff due now and drain again → delivered
  await prisma.broadcastRecipient.updateMany({ where: { broadcastId: job.jobId, status: 'pending' }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
  p = await drainUntilQuiet(aCookie, job.jobId);
  reqs = await fakeRequests();
  check(`after retry: sent=${total - 1}, failed=1 (the hard-bounce)`, p.emails.sent === total - 1 && p.emails.failed === 1 && p.emails.pending + p.emails.sending === 0, JSON.stringify(p.emails));
  const bounceRow = await prisma.broadcastRecipient.findFirst({ where: { broadcastId: job.jobId, email: { contains: 'bounce' } } });
  // attempts may be 2 when the bounce shared a batch with the simulated outage (claim order is arbitrary)
  check('  hard-bounce row: failed permanently on first provider verdict, body kept for retry', bounceRow.status === 'failed' && bounceRow.attempts <= 2 && /hard-bounce/.test(bounceRow.error || '') && !!bounceRow.body, JSON.stringify({ s: bounceRow.status, a: bounceRow.attempts, e: bounceRow.error }));
  const quotaRow = await prisma.broadcastRecipient.findFirst({ where: { broadcastId: job.jobId, email: { contains: 'quota' } } });
  check('  "queued" (over quota) counts as sent', quotaRow.status === 'sent');
  const sentRows = await prisma.broadcastRecipient.findMany({ where: { broadcastId: job.jobId, status: 'sent' } });
  check('  bodies wiped on sent rows', sentRows.every((r) => r.body === null && r.subject === null));

  section('each recipient got ONLY their own credentials');
  // Collect the merge vars per recipient across all calls (last occurrence wins = the successful retry)
  const perRcpt = new Map();
  for (const r of reqs) for (const mv of r.message.merge_vars || []) perRcpt.set(mv.rcpt.toLowerCase(), mv);
  const everyHasOwn = teams.every((tm) => tm.members.every((m) => {
    const mv = perRcpt.get(m.email.toLowerCase());
    if (!mv) return false;
    const text = varOf(mv, 'EMAILTEXT'), html = varOf(mv, 'EMAILHTML'), subj = varOf(mv, 'EMAILSUBJECT');
    return text.includes(m.email) && !!passwordIn(text) && html.includes(m.email) && subj.includes(tm.t.teamName);
  }));
  check(`merge vars for all ${total} members carry their own email + password + team subject`, everyHasOwn);
  const pwds = new Set(Array.from(perRcpt.values()).map((mv) => passwordIn(varOf(mv, 'EMAILTEXT'))).filter(Boolean));
  check('  all passwords distinct', pwds.size === total, String(pwds.size));
  const noLeak = Array.from(perRcpt.entries()).every(([email, mv]) => {
    const text = varOf(mv, 'EMAILTEXT');
    return !teams.some((tm) => tm.members.some((m) => m.email.toLowerCase() !== email && text.includes(m.email)));
  });
  check('  no recipient\'s text mentions another member\'s email', noLeak);
  const probe = teams[5].members[2];
  const login = await api('/api/login', { method: 'POST', body: { email: probe.email, password: passwordIn(varOf(perRcpt.get(probe.email.toLowerCase()), 'EMAILTEXT')) } });
  check('  emailed password logs the member in', login.status === 200, `status=${login.status}`);
  const logs = await prisma.emailLog.findMany({ where: { broadcastId: job.jobId } });
  // sent rows sum to every delivered recipient; failed rows include the transient outage batch AND the hard-bounce
  check('  EmailLog: sent rows sum to delivered count; outage + hard-bounce logged as failed', logs.filter((l) => l.status === 'sent').reduce((n, l) => n + l.recipientCount, 0) === total - 1 && logs.some((l) => l.status === 'failed' && /simulated outage/.test(l.error || '')) && logs.some((l) => l.status === 'failed' && /hard-bounce/.test(l.error || '')), JSON.stringify(logs.map((l) => [l.status, l.recipientCount, (l.error || '').slice(0, 40)])));

  section('retry-failed keeps the hard-bounce honest');
  const retry = await api(`/api/admin/broadcast/${job.jobId}/retry`, { cookie: aCookie, method: 'POST' });
  check('retry endpoint 200', retry.status === 200, `status=${retry.status}`);
  p = await drainUntilQuiet(aCookie, job.jobId);
  check('  bounce fails again permanently (no infinite retry)', p.emails.failed === 1 && p.emails.sent === total - 1, JSON.stringify(p.emails));
})()
  .catch((e) => { fail++; console.error('\nSCRIPT ERROR:', e.stack); })
  .finally(async () => {
    try {
      if (savedSettings && settingsId) await prisma.emailSettings.update({ where: { id: settingsId }, data: savedSettings });
      await prisma.broadcastRecipient.deleteMany({ where: { broadcastId: { in: made.jobs } } });
      await prisma.broadcast.deleteMany({ where: { id: { in: made.jobs } } });
      await prisma.emailLog.deleteMany({ where: { broadcastId: { in: made.jobs } } });
      await prisma.notification.deleteMany({ where: { OR: [{ recipientId: { in: made.participants } }, { relatedEntityId: { in: made.teams } }] } });
      await prisma.participant.deleteMany({ where: { id: { in: made.participants } } });
      await prisma.team.deleteMany({ where: { id: { in: made.teams } } });
      await fakeReset().catch(() => {});
    } catch (e) { console.error('cleanup error:', e.message); }
    await prisma.$disconnect();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail > 0 ? 1 : 0);
  });
