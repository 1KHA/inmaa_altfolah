/**
 * End-to-end suite for milestone deadline enforcement and resubmission.
 *
 * Before this feature the due date was decoration — `submit-milestone` never
 * checked it — and a rejected team could never try again. Run against the
 * local Docker test DB, never production.
 */
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const TAG = `sub${Date.now()}`;
const DAY = 864e5;

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { if (ok) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? '  -> ' + d : ''}`); } };
const section = (s) => console.log(`\n--- ${s} ---`);
const cookie = (c) => 'token=' + jwt.sign(c, SECRET, { expiresIn: '30m' });
async function api(p, { cookie: ck, method = 'GET', body } = {}) {
  const res = await fetch(BASE + p, { method, headers: { ...(ck ? { cookie: ck } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
async function waitForServer() {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/api/admin/phases')).status === 401) return; } catch {} await new Promise(r => setTimeout(r, 2000)); }
  throw new Error('server not reachable');
}

(async () => {
  if (!SECRET) throw new Error('JWT_SECRET required');
  await waitForServer();
  // Announcement EmailLog rows carry a fixed template subject, so cleanup has
  // to be scoped by time or it would delete other suites' rows too.
  const runStartedAt = new Date();
  const admin = await prisma.admin.upsert({ where: { username: `${TAG}-adm` }, update: {}, create: { username: `${TAG}-adm`, passwordHash: 'x' } });
  const aCookie = cookie({ id: admin.id, username: admin.username, role: 'admin' });

  const team = await prisma.team.create({ data: { teamName: `${TAG} فريق`, status: 'approved' } });
  const leader = await prisma.participant.create({ data: { email: `${TAG}-lead@t.local`, fullName: 'قائد', teamId: team.id, isLeader: true, status: 'pending' } });
  const pCookie = cookie({ id: leader.id, participantId: leader.id, email: leader.email, role: 'participant', teamId: team.id, isLeader: true });

  const mkMilestone = async (title, opts = {}) => (await api('/api/admin/milestones', { cookie: aCookie, method: 'POST', body: {
    title, description: 'd', requirements: 'r', status: 'active',
    dueDate: new Date(Date.now() + (opts.dueInDays ?? 7) * DAY).toISOString(),
    allowLateSubmission: opts.allowLate ?? false } })).json;
  const setDue = (id, when) => prisma.milestone.update({ where: { id }, data: { dueDate: when } });
  const submit = (milestoneId) => api('/api/participant/submit-milestone', { cookie: pCookie, method: 'POST', body: { milestoneId, filePath: 'p/f.pdf', fileName: 'f.pdf' } });
  const review = (mId, sId, reviewStatus, extra = {}) => api(`/api/admin/milestones/${mId}/submissions/${sId}/review`, { cookie: aCookie, method: 'POST', body: { reviewStatus, ...extra } });
  const subFor = (mId) => prisma.milestoneSubmission.findFirst({ where: { milestoneId: mId, participantId: leader.id } });

  section('deadline is enforced server-side');
  const mOpen = await mkMilestone(`${TAG} مفتوح`);
  let r = await submit(mOpen.id);
  check('submit before the deadline succeeds', r.status === 200 && r.json.success, JSON.stringify(r.json).slice(0, 120));

  const mPast = await mkMilestone(`${TAG} منتهي`);
  await setDue(mPast.id, new Date(Date.now() - 3 * DAY));
  r = await submit(mPast.id);
  check('submit after the deadline is REFUSED', r.status === 400 && /الموعد النهائي/.test(r.json.error || ''), JSON.stringify(r.json));
  check('…and nothing was stored', (await subFor(mPast.id)) === null);

  const mLate = await mkMilestone(`${TAG} متأخر مسموح`, { allowLate: true });
  await setDue(mLate.id, new Date(Date.now() - 3 * DAY));
  r = await submit(mLate.id);
  check('allowLateSubmission accepts it', r.status === 200 && r.json.isLate === true, JSON.stringify(r.json));
  check('the submission is flagged isLate', (await subFor(mLate.id)).isLate === true);

  section('same-day deadline is not cut short by timezone');
  const mToday = await mkMilestone(`${TAG} اليوم`);
  // "Today" must be TODAY IN RIYADH (the API's deadline day), not the UTC
  // date — between 00:00 and 03:00 Riyadh those differ and the old UTC-based
  // value pointed at a day whose Riyadh end had already passed.
  const riyadhToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date()); // YYYY-MM-DD
  await setDue(mToday.id, new Date(`${riyadhToday}T12:00:00+03:00`));
  r = await submit(mToday.id);
  check('submitting on the due day still works (end-of-day Riyadh)', r.status === 200, JSON.stringify(r.json).slice(0, 120));

  section('resubmission is refused unless the reviewer asks for it');
  r = await submit(mOpen.id);
  check('a second submission is blocked by default', r.status === 400 && /بالفعل/.test(r.json.error || ''), JSON.stringify(r.json));
  let sub = await subFor(mOpen.id);
  await review(mOpen.id, sub.id, 'rejected');
  r = await submit(mOpen.id);
  check('a REJECTED submission still cannot be replaced', r.status === 400, JSON.stringify(r.json));

  section('needs_resubmission re-opens the upload');
  r = await review(mOpen.id, sub.id, 'needs_resubmission');
  check('resubmission request without a comment -> 400', r.status === 400 && /الملاحظات/.test(r.json.error || ''), JSON.stringify(r.json));
  r = await review(mOpen.id, sub.id, 'needs_resubmission', { reviewComment: 'أضف المخططات' });
  check('with a comment -> 200', r.status === 200, JSON.stringify(r.json).slice(0, 120));
  sub = await subFor(mOpen.id);
  check('state recorded', sub.reviewStatus === 'needs_resubmission' && Boolean(sub.resubmissionRequestedAt), JSON.stringify({ s: sub.reviewStatus }));

  const beforeCount = (await prisma.milestone.findUnique({ where: { id: mOpen.id } })).submissionCount;
  r = await submit(mOpen.id);
  check('the participant can now resubmit', r.status === 200 && r.json.isResubmission === true, JSON.stringify(r.json));
  sub = await subFor(mOpen.id);
  check('row updated in place: pending again, count incremented, comment cleared',
        sub.reviewStatus === 'pending' && sub.resubmissionCount === 1 && sub.reviewComment === null,
        JSON.stringify({ s: sub.reviewStatus, c: sub.resubmissionCount }));
  check('a resubmission does NOT inflate submissionCount',
        (await prisma.milestone.findUnique({ where: { id: mOpen.id } })).submissionCount === beforeCount,
        String(beforeCount));
  r = await submit(mOpen.id);
  check('and it is blocked again until the reviewer asks once more', r.status === 400, JSON.stringify(r.json));

  section('a resubmission deadline overrides the milestone due date');
  const mExt = await mkMilestone(`${TAG} تمديد`);
  await submit(mExt.id);
  let subE = await subFor(mExt.id);
  await setDue(mExt.id, new Date(Date.now() - 2 * DAY));          // milestone now closed
  await review(mExt.id, subE.id, 'needs_resubmission', { reviewComment: 'أعد', resubmissionDeadline: new Date(Date.now() + 3 * DAY).toISOString() });
  r = await submit(mExt.id);
  check('the extension lets them submit past the milestone due date', r.status === 200, JSON.stringify(r.json));

  section('the participant can finally SEE their status');
  const list = await api('/api/milestones', { cookie: pCookie });
  const shown = (list.json || []).find((m) => m.id === mOpen.id);
  check('/api/milestones exposes reviewStatus', shown && shown.reviewStatus === 'pending', JSON.stringify(shown && shown.reviewStatus));
  check('…canSubmit / canResubmit / effectiveDeadline present',
        shown && typeof shown.canSubmit === 'boolean' && typeof shown.canResubmit === 'boolean' && Boolean(shown.effectiveDeadline),
        JSON.stringify(shown && { c: shown.canSubmit, r: shown.canResubmit }));
  const closed = (list.json || []).find((m) => m.id === mPast.id);
  check('a closed milestone reports canSubmit=false with a reason',
        closed && closed.canSubmit === false && Boolean(closed.submitBlockedReason), JSON.stringify(closed && closed.submitBlockedReason));

  section('the resubmission template exists and is admin-editable');
  const tpl = (await api('/api/admin/email-templates', { cookie: aCookie })).json.templates.find((t) => t.key === 'milestoneResubmissionRequested');
  check('milestoneResubmissionRequested is listed', Boolean(tpl));
  check('…with milestoneTitle / reviewComment / deadline',
        tpl && ['milestoneTitle', 'reviewComment', 'deadline'].every((v) => tpl.variables.includes(v)), tpl && tpl.variables.join(','));
  const notif = await prisma.notification.findFirst({ where: { recipientId: leader.id, title: { contains: 'إعادة تسليم' } } });
  check('a resubmission notification reached the team', Boolean(notif), 'none found');

  section('invalid review status');
  r = await review(mOpen.id, sub.id, 'banana');
  check('unknown reviewStatus -> 400', r.status === 400, String(r.status));

  section('cleanup');
  await prisma.milestoneSubmission.deleteMany({ where: { participantId: leader.id } });
  await prisma.notification.deleteMany({ where: { recipientId: leader.id } });
  await prisma.emailLog.deleteMany({
    where: {
      templateKey: { in: ['milestoneResubmissionRequested', 'milestoneReviewAccepted', 'milestoneReviewRejected', 'newMilestoneSubmission', 'newMilestoneAvailable'] },
      createdAt: { gte: runStartedAt },
    },
  });
  await prisma.milestone.deleteMany({ where: { title: { startsWith: TAG } } });
  await prisma.participant.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.team.deleteMany({ where: { teamName: { startsWith: TAG } } });
  await prisma.admin.delete({ where: { id: admin.id } });
  console.log('  cleaned up');

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('CRASH', e); await prisma.$disconnect(); process.exit(1); });
