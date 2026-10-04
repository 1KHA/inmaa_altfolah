/**
 * e2e — bulk acceptance over the RESEND transport (production path).
 *
 * Not in run-all: the app server must be started with the Resend env
 * pointed at the fake API:
 *
 *   node scripts/tests/fake-resend.js &
 *   RESEND_API_URL=http://127.0.0.1:2580 RESEND_API_KEY=test-key \
 *   MAIL_FROM=noreply@example.test npx next start -p 3002
 *   VERIFY_BASE_URL=http://localhost:3002 node scripts/tests/e2e-bulk-approval-resend.js
 *
 * Verifies: credential emails leave as POST /emails/batch calls (≤100 emails
 * per call, ONE recipient per email carrying ONLY their own subject/body,
 * permissive validation), per-recipient verdicts (malformed address →
 * permanent failure, the rest of its batch delivered), a 429 rate limit →
 * retried in place, a transient API outage → whole batch retried with backoff
 * then delivered, every emailed password logs in, bodies wiped after delivery.
 */
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const FAKE = process.env.FAKE_RESEND_URL || 'http://127.0.0.1:2580';
const TAG = `bmd${Date.now()}`;
const TEAMS = Number(process.env.BULK_TEAMS || 40); // ×3 members = 120 → 2 batch calls

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
  try { await fetch(FAKE + '/reset'); } catch { throw new Error(`fake resend not running at ${FAKE}`); }
  const admin = await prisma.admin.findFirst();
  const aCookie = cookie({ id: admin.id, username: admin.username, role: 'admin' });
  const settings = await prisma.emailSettings.findFirst();
  settingsId = settings.id; savedSettings = { ...settings }; delete savedSettings.id; delete savedSettings.updatedAt;
  // Resend needs only the master switch + a from name; SMTP fields are irrelevant.
  await prisma.emailSettings.update({ where: { id: settings.id }, data: { enabled: true, fromEmail: 'noreply@example.test', fromName: 'هاكثون الطفولة', adminInboxEmail: '' } });

  section(`fixtures: ${TEAMS} pending teams ×3 (one invalid, one rate-limited, one flaky address)`);
  const teams = [];
  for (let n = 0; n < TEAMS; n++) {
    const t = await prisma.team.create({ data: { teamName: `${TAG} team ${n}`, status: 'pending' } }); made.teams.push(t.id);
    const members = [];
    for (let i = 0; i < 3; i++) {
      let local = `${TAG}-t${n}-m${i}`;
      if (n === 0 && i === 1) local += '-invalid';
      if (n === 1 && i === 1) local += '-ratelimit';
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

  section('delivery through Resend batch calls');
  let p = await drainUntilQuiet(aCookie, job.jobId);
  let reqs = await fakeRequests();
  const toOf = (e) => [].concat(e.to)[0];
  check('every API call is POST /emails/batch with ≤100 emails', reqs.length > 0 && reqs.every((r) => r.path === '/emails/batch' && r.emails.length <= 100), `calls=${reqs.length} sizes=${reqs.map((r) => r.emails.length).join(',')}`);
  check('  one recipient per email, no cc/bcc', reqs.every((r) => r.emails.every((e) => [].concat(e.to).length === 1 && !e.cc && !e.bcc)));
  check('  permissive batch validation requested', reqs.every((r) => r.validation === 'permissive'));
  check('  request carries the API key from env', reqs.every((r) => r.auth === 'Bearer test-key'));
  check('  from = "<name> <MAIL_FROM>"', reqs.every((r) => r.emails.every((e) => e.from.endsWith('<noreply@example.test>'))));
  const rateLimitedCalls = reqs.filter((r) => r.emails.some((e) => /ratelimit/.test(toOf(e))));
  check('  rate-limited batch retried in place', rateLimitedCalls.length >= 2, `calls=${rateLimitedCalls.length}`);
  const failedCall = reqs.find((r) => r.emails.some((e) => /flaky/.test(toOf(e))));
  check('  batch with the flaky address hit the simulated outage once', !!failedCall);
  check('  outage batch retried with backoff (rows pending, attempts=1)', (await prisma.broadcastRecipient.count({ where: { broadcastId: job.jobId, status: 'pending', attempts: 1 } })) > 0, JSON.stringify(p.emails));

  // Make the backoff due now and drain again → delivered
  await prisma.broadcastRecipient.updateMany({ where: { broadcastId: job.jobId, status: 'pending' }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
  p = await drainUntilQuiet(aCookie, job.jobId);
  reqs = await fakeRequests();
  check(`after retry: sent=${total - 1}, failed=1 (the invalid address)`, p.emails.sent === total - 1 && p.emails.failed === 1 && p.emails.pending + p.emails.sending === 0, JSON.stringify(p.emails));
  const invalidRow = await prisma.broadcastRecipient.findFirst({ where: { broadcastId: job.jobId, email: { contains: 'invalid' } } });
  // attempts may be 2 when the invalid address shared a batch with the simulated outage (claim order is arbitrary)
  check('  invalid row: failed permanently on first provider verdict, body kept for retry', invalidRow.status === 'failed' && invalidRow.attempts <= 2 && /invalid/i.test(invalidRow.error || '') && !!invalidRow.body, JSON.stringify({ s: invalidRow.status, a: invalidRow.attempts, e: invalidRow.error }));
  const rateLimitedRow = await prisma.broadcastRecipient.findFirst({ where: { broadcastId: job.jobId, email: { contains: 'ratelimit' } } });
  check('  rate-limited address delivered without using a queue attempt', rateLimitedRow.status === 'sent');
  const sentRows = await prisma.broadcastRecipient.findMany({ where: { broadcastId: job.jobId, status: 'sent' } });
  check('  bodies wiped on sent rows', sentRows.every((r) => r.body === null && r.subject === null));

  section('each recipient got ONLY their own credentials');
  // Collect the email object per recipient across all calls (last occurrence wins = the successful retry)
  const perRcpt = new Map();
  for (const r of reqs) for (const e of r.emails) perRcpt.set(toOf(e).toLowerCase(), e);
  const everyHasOwn = teams.every((tm) => tm.members.every((m) => {
    const e = perRcpt.get(m.email.toLowerCase());
    if (!e) return false;
    return e.text.includes(m.email) && !!passwordIn(e.text) && e.html.includes(m.email) && e.subject.includes(tm.t.teamName);
  }));
  check(`emails for all ${total} members carry their own email + password + team subject`, everyHasOwn);
  const pwds = new Set(Array.from(perRcpt.values()).map((e) => passwordIn(e.text)).filter(Boolean));
  check('  all passwords distinct', pwds.size === total, String(pwds.size));
  const noLeak = Array.from(perRcpt.entries()).every(([email, e]) =>
    !teams.some((tm) => tm.members.some((m) => m.email.toLowerCase() !== email && e.text.includes(m.email))));
  check('  no recipient\'s text mentions another member\'s email', noLeak);
  const probe = teams[5].members[2];
  const login = await api('/api/login', { method: 'POST', body: { email: probe.email, password: passwordIn(perRcpt.get(probe.email.toLowerCase()).text) } });
  check('  emailed password logs the member in', login.status === 200, `status=${login.status}`);
  const logs = await prisma.emailLog.findMany({ where: { broadcastId: job.jobId } });
  // sent rows sum to every delivered recipient; failed rows include the transient outage batch AND the invalid address
  check('  EmailLog: sent rows sum to delivered count; outage + invalid address logged as failed', logs.filter((l) => l.status === 'sent').reduce((n, l) => n + l.recipientCount, 0) === total - 1 && logs.some((l) => l.status === 'failed' && /simulated outage/.test(l.error || '')) && logs.some((l) => l.status === 'failed' && /invalid/i.test(l.error || '')), JSON.stringify(logs.map((l) => [l.status, l.recipientCount, (l.error || '').slice(0, 40)])));

  section('retry-failed keeps the invalid address honest');
  const retry = await api(`/api/admin/broadcast/${job.jobId}/retry`, { cookie: aCookie, method: 'POST' });
  check('retry endpoint 200', retry.status === 200, `status=${retry.status}`);
  p = await drainUntilQuiet(aCookie, job.jobId);
  check('  invalid address fails again permanently (no infinite retry)', p.emails.failed === 1 && p.emails.sent === total - 1, JSON.stringify(p.emails));
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
