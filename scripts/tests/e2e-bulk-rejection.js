/**
 * e2e — bulk REJECTION of teams / individual participants.
 *
 * The sibling of e2e-bulk-approval.js: same job machine, `action: 'reject'`.
 * Verifies, against the real HTTP API + Mailpit (localhost:1025/8025):
 *   - only pending, enabled rows are rejected; approved / already-rejected /
 *     disabled rows are skipped and left exactly as they were;
 *   - rejection sets status only — no password is issued to anybody;
 *   - every member of a rejected team gets one queued rejection email;
 *   - re-running the same job is a no-op (idempotent);
 *   - a selection job touches nothing outside the selection;
 *   - the endpoint stays admin-only.
 *
 * Needs: JWT_SECRET, VERIFY_BASE_URL (prod build on :3002), DATABASE_URL.
 */
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const MAILPIT = process.env.MAILPIT_URL || 'http://localhost:8025';
const TAG = `rej${Date.now()}`;
const TEAMS = Number(process.env.REJECT_TEAMS || 6);
const SOLOS = Number(process.env.REJECT_SOLOS || 4);

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
async function mailFor(addr) {
  const d = await mp(`/api/v1/search?query=${encodeURIComponent('to:' + addr)}&limit=10`);
  return d.messages || [];
}

/** Drive a job to completion, then push its queued email out. */
async function runJob(aCookie, body) {
  let p = (await api('/api/admin/bulk-approve', { cookie: aCookie, method: 'POST', body })).json;
  while (p && !p.done) p = (await api('/api/admin/bulk-approve', { cookie: aCookie, method: 'POST', body: { jobId: p.jobId } })).json;
  return p;
}
async function drainAll(aCookie, jobId) {
  let p = (await api(`/api/admin/bulk-approve?jobId=${jobId}`, { cookie: aCookie })).json;
  let idle = 0;
  for (let i = 0; i < 200; i++) {
    if (p.emails.pending + p.emails.sending === 0) return p;
    const before = p.emails.sent + p.emails.failed;
    const r = await api('/api/admin/email-queue/drain', { cookie: aCookie, method: 'POST' });
    if (r.json?.stoppedBy === 'email-disabled') return (await api(`/api/admin/bulk-approve?jobId=${jobId}`, { cookie: aCookie })).json;
    await sleep(700);
    p = (await api(`/api/admin/bulk-approve?jobId=${jobId}`, { cookie: aCookie })).json;
    idle = (p.emails.sent + p.emails.failed !== before) || p.emails.sending > 0 ? 0 : idle + 1;
    if (idle >= 6) return p;
  }
  return p;
}

const made = { teams: [], participants: [], jobs: [] };
let savedSettings = null, settingsId = null;

async function mkTeam(n, status = 'pending', extra = {}) {
  const t = await prisma.team.create({ data: { teamName: `${TAG} team ${n}`, status, ...extra } });
  made.teams.push(t.id);
  const members = [];
  for (let i = 0; i < 3; i++) {
    const p = await prisma.participant.create({
      data: {
        email: `${TAG}-t${n}-m${i}@e2e.test`,
        fullName: `T${n} M${i}`,
        teamId: t.id,
        isLeader: i === 0,
        status: status === 'approved' ? 'approved' : 'pending',
        passwordHash: status === 'approved' ? 'keep-this-hash' : null,
      },
    });
    made.participants.push(p.id); members.push(p);
  }
  return { team: t, members };
}

async function mkSolo(n, status = 'pending', extra = {}) {
  const p = await prisma.participant.create({
    data: { email: `${TAG}-s${n}@e2e.test`, fullName: `Solo ${n}`, status, ...extra },
  });
  made.participants.push(p.id);
  return p;
}

(async () => {
  if (!SECRET) throw new Error('JWT_SECRET required');
  const admin = await prisma.admin.findFirst();
  const aCookie = cookie({ id: admin.id, username: admin.username, role: 'admin' });

  const settings = await prisma.emailSettings.findFirst();
  settingsId = settings.id;
  savedSettings = { ...settings }; delete savedSettings.id; delete savedSettings.updatedAt;
  await prisma.emailSettings.update({
    where: { id: settings.id },
    data: { enabled: true, host: '127.0.0.1', port: Number(process.env.MAILPIT_SMTP_PORT || 1025), secure: false, username: '', password: '', fromEmail: 'noreply@example.test', fromName: 'E2E', adminInboxEmail: '' },
  });
  await clearMp();

  // ---------- fixtures ----------
  section(`fixtures: ${TEAMS} pending teams ×3 members, 1 approved, 1 disabled, ${SOLOS} pending solos`);
  const pendingTeams = [];
  for (let n = 0; n < TEAMS; n++) pendingTeams.push(await mkTeam(n));
  const approvedTeam = await mkTeam('approved', 'approved');
  const disabledTeam = await mkTeam('disabled', 'pending', { isDisabled: true });
  const solos = [];
  for (let n = 0; n < SOLOS; n++) solos.push(await mkSolo(n));
  const approvedSolo = await mkSolo('approved', 'approved', { passwordHash: 'keep-this-hash' });
  check('fixtures created', pendingTeams.length === TEAMS && solos.length === SOLOS);

  // ---------- auth ----------
  section('auth');
  check('POST without a token -> 401', (await api('/api/admin/bulk-approve', { method: 'POST', body: { target: 'teams', action: 'reject' } })).status === 401);
  check('GET count without a token -> 401', (await api('/api/admin/bulk-approve?target=teams')).status === 401);

  // ---------- selection reject: teams ----------
  section('reject a selection of teams');
  const selection = pendingTeams.slice(0, 2).map((t) => t.team.id);
  const selJob = await runJob(aCookie, { target: 'teams', action: 'reject', ids: selection });
  made.jobs.push(selJob.jobId);
  check('job completed', selJob.done === true, JSON.stringify({ approved: selJob.approved, skipped: selJob.skipped, failed: selJob.failed }));
  check('  both selected teams counted', selJob.approved === 2, String(selJob.approved));
  const selRows = await prisma.team.findMany({ where: { id: { in: selection } }, select: { status: true } });
  check('  selected teams are rejected', selRows.every((t) => t.status === 'rejected'));
  const untouched = await prisma.team.findFirst({ where: { id: pendingTeams[2].team.id }, select: { status: true } });
  check('  teams outside the selection untouched', untouched.status === 'pending', untouched.status);
  const selMembers = await prisma.participant.findMany({ where: { teamId: { in: selection } }, select: { passwordHash: true, status: true } });
  check('  no password issued to a rejected member', selMembers.every((m) => !m.passwordHash));

  // ---------- reject everything still pending ----------
  section('reject all pending teams');
  const allJob = await runJob(aCookie, { target: 'teams', action: 'reject' });
  made.jobs.push(allJob.jobId);
  check('job completed', allJob.done === true);
  check(`  remaining ${TEAMS - 2} teams rejected`, allJob.approved >= TEAMS - 2, String(allJob.approved));
  const stillPending = await prisma.team.count({ where: { id: { in: pendingTeams.map((t) => t.team.id) }, status: 'pending' } });
  check('  no fixture team left pending', stillPending === 0, String(stillPending));
  const approvedAfter = await prisma.team.findUnique({ where: { id: approvedTeam.team.id }, select: { status: true } });
  check('  an approved team is NOT rejected', approvedAfter.status === 'approved', approvedAfter.status);
  const disabledAfter = await prisma.team.findUnique({ where: { id: disabledTeam.team.id }, select: { status: true } });
  check('  a disabled pending team is skipped', disabledAfter.status === 'pending', disabledAfter.status);
  const keptHash = await prisma.participant.findFirst({ where: { teamId: approvedTeam.team.id }, select: { passwordHash: true } });
  check('  approved members keep their credentials', keptHash.passwordHash === 'keep-this-hash');

  // ---------- idempotency ----------
  section('idempotency');
  const rerun = await runJob(aCookie, { target: 'teams', action: 'reject' });
  made.jobs.push(rerun.jobId);
  check('re-running rejects nothing new', rerun.approved === 0, String(rerun.approved));

  // ---------- email ----------
  section('rejection email');
  const drained = await drainAll(aCookie, allJob.jobId);
  check('queued rejection emails were delivered', drained.emails.total > 0 && drained.emails.sent === drained.emails.total,
    JSON.stringify(drained.emails));
  const oneMember = `${TAG}-t3-m1@e2e.test`;
  const inbox = await mailFor(oneMember);
  check('  each member got exactly one rejection email', inbox.length === 1, String(inbox.length));
  if (inbox.length) {
    const body = await mp('/api/v1/message/' + inbox[0].ID);
    const text = (body.Text || '') + (body.HTML || '');
    check('  the email carries no password', !/كلمة المرور/.test(text));
  }
  // Queued sends are accounted on the job row (EmailLog is written by the
  // inline dispatch path, which bulk jobs deliberately bypass).
  const jobCounters = await prisma.broadcast.findUnique({
    where: { id: allJob.jobId },
    select: { totalRecipients: true, emailSentCount: true, emailFailedCount: true, status: true },
  });
  check('  job row counts every delivered rejection email',
    jobCounters.emailSentCount === jobCounters.totalRecipients && jobCounters.emailFailedCount === 0,
    JSON.stringify(jobCounters));
  const leftovers = await prisma.broadcastRecipient.count({
    where: { broadcastId: allJob.jobId, NOT: { body: null } },
  });
  check('  rendered bodies wiped after delivery', leftovers === 0, String(leftovers));

  // ---------- individual participants ----------
  section('reject all pending individual participants');
  const soloJob = await runJob(aCookie, { target: 'participants', action: 'reject' });
  made.jobs.push(soloJob.jobId);
  check('job completed', soloJob.done === true);
  const soloRows = await prisma.participant.findMany({ where: { id: { in: solos.map((s) => s.id) } }, select: { status: true, passwordHash: true } });
  check('  every fixture solo is rejected', soloRows.every((s) => s.status === 'rejected'));
  check('  no password issued', soloRows.every((s) => !s.passwordHash));
  const approvedSoloAfter = await prisma.participant.findUnique({ where: { id: approvedSolo.id }, select: { status: true, passwordHash: true } });
  check('  an approved solo is untouched', approvedSoloAfter.status === 'approved' && approvedSoloAfter.passwordHash === 'keep-this-hash');

  // ---------- job bookkeeping ----------
  section('job row');
  const jobRow = await prisma.broadcast.findUnique({ where: { id: allJob.jobId }, select: { title: true, audience: true } });
  check('job titled as a rejection', /رفض جماعي/.test(jobRow.title), jobRow.title);
  check('job state carries action=reject', JSON.parse(jobRow.audience).action === 'reject');
})()
  .catch((e) => { fail++; console.error('SCRIPT ERROR:', e.stack); })
  .finally(async () => {
    section('cleanup');
    try {
      if (made.jobs.length) {
        await prisma.broadcastRecipient.deleteMany({ where: { broadcastId: { in: made.jobs } } });
        await prisma.emailLog.deleteMany({ where: { broadcastId: { in: made.jobs } } });
        await prisma.broadcast.deleteMany({ where: { id: { in: made.jobs } } });
      }
      await prisma.notification.deleteMany({ where: { recipientId: { in: made.participants } } });
      await prisma.participant.deleteMany({ where: { id: { in: made.participants } } });
      await prisma.team.deleteMany({ where: { id: { in: made.teams } } });
      if (settingsId && savedSettings) await prisma.emailSettings.update({ where: { id: settingsId }, data: savedSettings });
      console.log('  fixtures removed, e-mail settings restored');
    } catch (e) {
      console.error('  cleanup failed:', e.message);
    }
    await prisma.$disconnect();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  });
