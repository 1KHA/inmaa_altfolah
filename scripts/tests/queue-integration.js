/**
 * Integration test for the broadcast email queue (src/lib/email-queue.ts)
 * against a real Postgres, with the transport faked (no SMTP/Resend needed).
 *
 * Usage:
 *   DATABASE_URL=postgresql://... DATABASE_TYPE=postgresql JWT_SECRET=x \
 *     node scripts/tests/queue-integration.js
 *
 * Compiles src/lib/email-queue.ts (+ deps) with tsc into
 * node_modules/.cache/queue-test on every run. Wipes Broadcast /
 * BroadcastRecipient rows in the target DB — point it at a scratch database,
 * never production. Covers: 5,000-recipient drain, partial batches with
 * permanent vs retryable failures + backoff, max attempts, concurrent
 * drainers (SKIP LOCKED), time budget release/resume, stale-claim recovery,
 * master switch off, retry-failed, enqueue de-dup, admin inbox stamping.
 * See mdfiles/email-queue.md §Testing.
 */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const REPO = path.resolve(__dirname, '..', '..');
const OUT = path.join(REPO, 'node_modules', '.cache', 'queue-test');

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'tsconfig.json'), JSON.stringify({
  compilerOptions: { module: 'commonjs', target: 'es2020', esModuleInterop: true, skipLibCheck: true, moduleResolution: 'node', outDir: OUT, rootDir: path.join(REPO, 'src'), strict: false },
  files: [path.join(REPO, 'src/lib/email-queue.ts')],
}));
execFileSync(path.join(REPO, 'node_modules/.bin/tsc'), ['-p', path.join(OUT, 'tsconfig.json')], { stdio: 'inherit' });

const assert = require('assert');
const Q = require(path.join(OUT, 'lib/email-queue.js'));
const { prisma } = require(path.join(OUT, 'lib/prisma.js'));
const { encryptSecret } = require(path.join(OUT, 'lib/crypto.js'));

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ' -> ' + detail : ''}`); } };
const section = (s) => console.log(`\n--- ${s} ---`);

async function mkBroadcast(title = 'b') {
  return prisma.broadcast.create({ data: { title, body: 'body', emailSubject: 'subj', channels: '["email"]', audience: '{"type":"all-participants"}', createdBy: 'admin-test' } });
}
const emails = (n, prefix) => Array.from({ length: n }, (_, i) => `${prefix}${String(i).padStart(5, '0')}@test.local`);
const inputs = (list) => list.map((email, i) => ({ recipientType: 'participant', recipientId: `p-${email}`, email }));
const rowsOf = (bid) => prisma.broadcastRecipient.findMany({ where: { broadcastId: bid } });
const bcast = (bid) => prisma.broadcast.findUnique({ where: { id: bid } });

/** Fake transport: accepts everything except rules. Records every email seen. */
function fakeSend(rules = {}) {
  const seen = new Map(); const calls = [];
  const fn = async ({ bcc }) => {
    calls.push(bcc.length);
    if (rules.delayMs) await new Promise((r) => setTimeout(r, rules.delayMs));
    const accepted = [], rejected = [];
    for (const e of bcc) {
      seen.set(e, (seen.get(e) || 0) + 1);
      if (e.includes('bounce')) rejected.push({ email: e, reason: 'rejected: hard-bounce', permanent: true });
      else if (e.includes('flaky') && seen.get(e) === 1) rejected.push({ email: e, reason: 'Resend request failed: ECONNRESET' });
      else if (e.includes('dead')) rejected.push({ email: e, reason: 'Resend service_unavailable: HTTP 503' });
      else accepted.push(e);
    }
    return { ok: accepted.length > 0, messageId: accepted.length ? 'mid-' + calls.length : undefined, error: rejected.length ? 'some rejected' : undefined, accepted, rejected };
  };
  return { fn, seen, calls };
}

(async () => {
  // settings: enabled SMTP config (transport itself is faked)
  await prisma.broadcastRecipient.deleteMany({}); await prisma.broadcast.deleteMany({});
  const es = await prisma.emailSettings.findFirst();
  await prisma.emailSettings.update({ where: { id: es.id }, data: { enabled: true, host: '127.0.0.1', port: 2525, fromEmail: 'noreply@test.local', fromName: 'T', password: encryptSecret('x'), adminInboxEmail: 'admins@test.local' } });

  section('1. 5,000 recipients drain in one run');
  let b = await mkBroadcast('five-k');
  let t0 = Date.now();
  let n = await Q.enqueueBroadcastRecipients(b.id, inputs(emails(5000, 'u')));
  const tEnq = Date.now() - t0;
  check('enqueued 5000', n === 5000, String(n));
  check('status queued after enqueue', (await bcast(b.id)).status === 'queued');
  let fs = fakeSend();
  t0 = Date.now();
  let r = await Q.drainEmailQueue({ budgetMs: 120000, send: fs.fn });
  const tDrain = Date.now() - t0;
  check('all 5000 sent', r.sent === 5000 && r.failed === 0, JSON.stringify(r));
  check('each email sent exactly once', fs.seen.size === 5000 && [...fs.seen.values()].every((v) => v === 1));
  check('batched at transport size (SMTP=50 => 100 calls)', fs.calls.length === 100 && fs.calls.every((c) => c === 50), String(fs.calls.length));
  let bb = await bcast(b.id);
  check('counters 5000/0, status completed', bb.emailSentCount === 5000 && bb.emailFailedCount === 0 && bb.status === 'completed' && bb.totalRecipients === 5000, JSON.stringify({ s: bb.emailSentCount, f: bb.emailFailedCount, st: bb.status }));
  check('no rows left open', r.remaining === 0);
  console.log(`      timing: enqueue ${tEnq}ms, drain ${tDrain}ms (fake transport, incl. all DB writes)`);

  section('2. partial batch: permanent vs retryable failures');
  b = await mkBroadcast('partial');
  const list = [...emails(96, 'ok'), 'bounce1@test.local', 'bounce2@test.local', 'flaky1@test.local', 'flaky2@test.local'];
  await Q.enqueueBroadcastRecipients(b.id, inputs(list));
  fs = fakeSend();
  let clock = Date.now();
  r = await Q.drainEmailQueue({ budgetMs: 60000, send: fs.fn, now: () => clock });
  check('first pass: 96 sent, 2 failed (permanent), 2 retried', r.sent === 96 && r.failed === 2 && r.retried === 2, JSON.stringify(r));
  let rows = await rowsOf(b.id);
  const flaky = rows.filter((x) => x.email.startsWith('flaky'));
  check('flaky rows pending with backoff + attempts=1', flaky.every((x) => x.status === 'pending' && x.attempts === 1 && x.nextAttemptAt && x.error.includes('ECONNRESET')));
  check('bounce rows failed, never retried', rows.filter((x) => x.email.startsWith('bounce')).every((x) => x.status === 'failed' && x.attempts === 1 && x.error === 'rejected: hard-bounce'));
  bb = await bcast(b.id);
  check('mid-way status sending, counters 96/2', bb.status === 'sending' && bb.emailSentCount === 96 && bb.emailFailedCount === 2, bb.status);
  r = await Q.drainEmailQueue({ budgetMs: 60000, send: fs.fn, now: () => clock });
  check('before backoff elapses: nothing claimed', r.claimed === 0, JSON.stringify(r));
  clock += 61000;
  r = await Q.drainEmailQueue({ budgetMs: 60000, send: fs.fn, now: () => clock });
  check('after backoff: 2 flaky sent', r.sent === 2 && r.claimed === 2, JSON.stringify(r));
  bb = await bcast(b.id);
  check('final status partial, counters 98/2', bb.status === 'partial' && bb.emailSentCount === 98 && bb.emailFailedCount === 2);
  check('flaky attempts=2, sent', (await rowsOf(b.id)).filter((x) => x.email.startsWith('flaky')).every((x) => x.status === 'sent' && x.attempts === 2));
  check('bounce addresses were only ever tried once', fs.seen.get('bounce1@test.local') === 1);

  section('3. max attempts');
  b = await mkBroadcast('dead');
  await Q.enqueueBroadcastRecipients(b.id, inputs(['dead1@test.local']));
  fs = fakeSend(); clock = Date.now();
  for (let i = 0; i < 5; i++) { await Q.drainEmailQueue({ budgetMs: 60000, send: fs.fn, now: () => clock }); clock += 10 * 60000; }
  rows = await rowsOf(b.id);
  check(`gives up after ${Q.QUEUE_MAX_ATTEMPTS} attempts -> failed`, rows[0].status === 'failed' && rows[0].attempts === Q.QUEUE_MAX_ATTEMPTS, JSON.stringify({ s: rows[0].status, a: rows[0].attempts }));
  check('not tried more than max', fs.seen.get('dead1@test.local') === Q.QUEUE_MAX_ATTEMPTS);
  check('status partial', (await bcast(b.id)).status === 'partial');

  section('4. concurrent drainers (cron + inline) never double-send');
  b = await mkBroadcast('concurrent');
  await Q.enqueueBroadcastRecipients(b.id, inputs(emails(2000, 'c')));
  fs = fakeSend({ delayMs: 3 });
  const results = await Promise.all([1, 2, 3, 4].map(() => Q.drainEmailQueue({ budgetMs: 60000, sliceSize: 100, send: fs.fn })));
  const totalSent = results.reduce((a, x) => a + x.sent, 0), totalClaimed = results.reduce((a, x) => a + x.claimed, 0);
  check('4 drainers together sent exactly 2000', totalSent === 2000 && totalClaimed === 2000, JSON.stringify(results.map((x) => x.sent)));
  check('every email exactly once across drainers', fs.seen.size === 2000 && [...fs.seen.values()].every((v) => v === 1));
  check('work was actually shared', results.filter((x) => x.sent > 0).length >= 2, JSON.stringify(results.map((x) => x.sent)));
  check('completed', (await bcast(b.id)).status === 'completed');

  section('5. time budget: stop, release, resume');
  b = await mkBroadcast('budget');
  await Q.enqueueBroadcastRecipients(b.id, inputs(emails(1000, 'g')));
  fs = fakeSend({ delayMs: 20 });
  r = await Q.drainEmailQueue({ budgetMs: 150, sliceSize: 200, send: fs.fn });
  check('stopped by budget with rows released', r.stoppedBy === 'budget' && r.released > 0 && r.remaining > 0 && r.sent > 0, JSON.stringify(r));
  bb = await bcast(b.id);
  check('status sending, counters reflect progress', bb.status === 'sending' && bb.emailSentCount === r.sent);
  check('no rows stuck in sending', (await prisma.broadcastRecipient.count({ where: { broadcastId: b.id, status: 'sending' } })) === 0);
  r = await Q.drainEmailQueue({ budgetMs: 60000, send: fs.fn });
  check('next run finishes the rest', r.remaining === 0 && (await bcast(b.id)).status === 'completed' && fs.seen.size === 1000 && [...fs.seen.values()].every((v) => v === 1));

  section('6. stale claim recovery (drainer died mid-slice)');
  b = await mkBroadcast('stale');
  await Q.enqueueBroadcastRecipients(b.id, inputs(emails(50, 's')));
  await prisma.broadcastRecipient.updateMany({ where: { broadcastId: b.id }, data: { status: 'sending', claimedAt: new Date(Date.now() - 11 * 60000) } });
  fs = fakeSend();
  r = await Q.drainEmailQueue({ budgetMs: 60000, send: fs.fn });
  check('stale sending rows re-claimed and sent', r.claimed === 50 && r.sent === 50, JSON.stringify(r));
  await prisma.broadcastRecipient.updateMany({ where: { broadcastId: b.id }, data: { status: 'sending', claimedAt: new Date() } });
  r = await Q.drainEmailQueue({ budgetMs: 60000, send: fs.fn });
  check('fresh sending rows are NOT re-claimed', r.claimed === 0);
  await prisma.broadcastRecipient.updateMany({ where: { broadcastId: b.id }, data: { status: 'sent', claimedAt: null } });

  section('7. master switch off: park, do not fail');
  b = await mkBroadcast('disabled');
  await Q.enqueueBroadcastRecipients(b.id, inputs(emails(10, 'd')));
  await prisma.emailSettings.update({ where: { id: es.id }, data: { enabled: false } });
  fs = fakeSend();
  r = await Q.drainEmailQueue({ budgetMs: 60000, send: fs.fn });
  check('stoppedBy email-disabled, rows released, nothing sent', r.stoppedBy === 'email-disabled' && r.released === 10 && r.sent === 0 && fs.seen.size === 0, JSON.stringify(r));
  check('rows back to pending', (await prisma.broadcastRecipient.count({ where: { broadcastId: b.id, status: 'pending' } })) === 10);
  await prisma.emailSettings.update({ where: { id: es.id }, data: { enabled: true } });
  r = await Q.drainEmailQueue({ budgetMs: 60000, send: fs.fn });
  check('re-enabled: sent', r.sent === 10);

  section('8. retry failed (admin button)');
  b = await mkBroadcast('retry');
  await Q.enqueueBroadcastRecipients(b.id, inputs(['flaky9@test.local', 'bounce9@test.local', 'ok9@test.local']));
  fs = fakeSend(); clock = Date.now();
  for (let i = 0; i < 4; i++) { await Q.drainEmailQueue({ budgetMs: 60000, send: fs.fn, now: () => clock }); clock += 10 * 60000; }
  bb = await bcast(b.id);
  check('before: partial 2/1', bb.status === 'partial' && bb.emailSentCount === 2 && bb.emailFailedCount === 1);
  n = await Q.requeueFailed(b.id);
  check('requeued 1', n === 1);
  check('status back to sending', (await bcast(b.id)).status === 'sending');
  r = await Q.drainEmailQueue({ budgetMs: 60000, send: fs.fn, now: () => clock });
  check('permanent bounce fails again honestly', r.failed === 1 && (await bcast(b.id)).status === 'partial');

  section('9. enqueue de-dup + admin inbox row stamps admin notifications');
  b = await mkBroadcast('dedupe');
  n = await Q.enqueueBroadcastRecipients(b.id, [...inputs(['dup@test.local', 'dup@test.local', 'DUP2@test.local']), { recipientType: 'admin', recipientId: Q.ADMIN_INBOX_RECIPIENT_ID, email: 'admins@test.local' }]);
  check('duplicate email within a broadcast collapses (4 in -> 3 rows)', n === 3, String(n));
  const nid = 'n-' + b.id;
  await prisma.notification.create({ data: { id: nid, title: 't', message: 'm', type: 'info', recipientType: 'admin', recipientId: 'admin-1', relatedEntityType: 'broadcast', relatedEntityId: b.id } });
  fs = fakeSend();
  r = await Q.drainEmailQueue({ budgetMs: 60000, send: fs.fn });
  check('3 sent', r.sent === 3, JSON.stringify(r));
  check('admin notification stamped via shared-inbox row', (await prisma.notification.findUnique({ where: { id: nid } })).emailStatus === 'sent');
  await prisma.notification.delete({ where: { id: nid } });

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('CRASH', e); await prisma.$disconnect(); process.exit(1); });
