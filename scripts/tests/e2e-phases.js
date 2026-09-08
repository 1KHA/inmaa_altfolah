/**
 * End-to-end suite for phases (mdfiles/phases-plan.md).
 *
 * Covers the CRUD API, bulk assign / next / previous / fail / clear, counts,
 * boundary handling, phase-disable, phase-targeted email, and auto-advance on
 * milestone review.
 *
 * Needs a running app (VERIFY_BASE_URL), its DATABASE_URL and JWT_SECRET.
 * Run against the local Docker test DB — never production.
 */
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET;
const TAG = `ph${Date.now()}`;

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  if (!SECRET) throw new Error('JWT_SECRET required');
  await waitForServer();
  const admin = await prisma.admin.upsert({ where: { username: `${TAG}-adm` }, update: {}, create: { username: `${TAG}-adm`, passwordHash: 'x' } });
  const aCookie = cookie({ id: admin.id, username: admin.username, role: 'admin' });

  section('phase CRUD');
  let r = await api('/api/admin/phases', { method: 'POST', body: { name: `${TAG} أولى` } });
  check('create without admin cookie -> 401', r.status === 401, String(r.status));
  r = await api('/api/admin/phases', { cookie: aCookie, method: 'POST', body: { name: `${TAG} أولى` } });
  check('create phase 1', r.status === 201, JSON.stringify(r.json).slice(0, 100));
  const p1 = r.json.phase;
  r = await api('/api/admin/phases', { cookie: aCookie, method: 'POST', body: { name: `${TAG} ثانية` } });
  const p2 = r.json.phase;
  r = await api('/api/admin/phases', { cookie: aCookie, method: 'POST', body: { name: `${TAG} ثالثة` } });
  const p3 = r.json.phase;
  check('order auto-increments', p2.order === p1.order + 1 && p3.order === p2.order + 1, `${p1.order},${p2.order},${p3.order}`);
  r = await api('/api/admin/phases', { cookie: aCookie, method: 'POST', body: { name: `${TAG} أولى` } });
  check('duplicate name -> 400', r.status === 400, String(r.status));
  r = await api('/api/admin/phases', { cookie: aCookie, method: 'POST', body: { name: '' } });
  check('empty name -> 400', r.status === 400, String(r.status));

  section('fixtures');
  const teamA = await prisma.team.create({ data: { teamName: `${TAG} فريق أ`, status: 'approved' } });
  const teamB = await prisma.team.create({ data: { teamName: `${TAG} فريق ب`, status: 'approved' } });
  const leadA = await prisma.participant.create({ data: { email: `${TAG}-la@t.local`, fullName: 'قائد أ', teamId: teamA.id, isLeader: true, status: 'pending' } });
  const leadB = await prisma.participant.create({ data: { email: `${TAG}-lb@t.local`, fullName: 'قائد ب', teamId: teamB.id, isLeader: true, status: 'pending' } });
  const solo = await prisma.participant.create({ data: { email: `${TAG}-solo@t.local`, fullName: 'فردي', status: 'approved' } });
  check('fixtures created', Boolean(teamA && teamB && solo));

  section('bulk assign to a phase');
  r = await api('/api/admin/phases/assign', { cookie: aCookie, method: 'POST', body: { teamIds: [teamA.id, teamB.id], participantIds: [solo.id], mode: 'set', phaseId: p1.id } });
  check('assign 3 -> 200', r.status === 200 && r.json.moved === 3, JSON.stringify(r.json));
  check('teams are in phase 1', (await prisma.team.count({ where: { phaseId: p1.id } })) === 2);
  check('individual is in phase 1', (await prisma.participant.findUnique({ where: { id: solo.id } })).phaseId === p1.id);
  r = await api('/api/admin/phases/assign', { cookie: aCookie, method: 'POST', body: { teamIds: [teamA.id], mode: 'set' } });
  check('set without phaseId -> 400', r.status === 400, String(r.status));
  r = await api('/api/admin/phases/assign', { cookie: aCookie, method: 'POST', body: { teamIds: [teamA.id], mode: 'sideways' } });
  check('invalid mode -> 400', r.status === 400, String(r.status));
  r = await api('/api/admin/phases/assign', { cookie: aCookie, method: 'POST', body: { mode: 'next' } });
  check('empty selection -> 400', r.status === 400, String(r.status));

  section('counts');
  r = await api('/api/admin/phases', { cookie: aCookie });
  let ph1 = r.json.phases.find((x) => x.id === p1.id);
  check('phase 1 counts 2 teams + 1 participant', ph1.counts.teams === 2 && ph1.counts.participants === 1, JSON.stringify(ph1.counts));

  section('manual move: next / previous');
  r = await api('/api/admin/phases/assign', { cookie: aCookie, method: 'POST', body: { teamIds: [teamA.id], mode: 'next' } });
  check('team A -> phase 2', r.json.moved === 1 && (await prisma.team.findUnique({ where: { id: teamA.id } })).phaseId === p2.id, JSON.stringify(r.json));
  r = await api('/api/admin/phases/assign', { cookie: aCookie, method: 'POST', body: { teamIds: [teamA.id], mode: 'previous' } });
  check('team A -> back to phase 1', r.json.moved === 1 && (await prisma.team.findUnique({ where: { id: teamA.id } })).phaseId === p1.id);
  r = await api('/api/admin/phases/assign', { cookie: aCookie, method: 'POST', body: { teamIds: [teamA.id], mode: 'previous' } });
  check('previous at first phase -> boundary, not moved', r.json.moved === 0 && r.json.atBoundary === 1, JSON.stringify(r.json));
  await api('/api/admin/phases/assign', { cookie: aCookie, method: 'POST', body: { teamIds: [teamA.id], mode: 'set', phaseId: p3.id } });
  r = await api('/api/admin/phases/assign', { cookie: aCookie, method: 'POST', body: { teamIds: [teamA.id], mode: 'next' } });
  check('next at last phase -> boundary', r.json.moved === 0 && r.json.atBoundary === 1, JSON.stringify(r.json));
  await api('/api/admin/phases/assign', { cookie: aCookie, method: 'POST', body: { teamIds: [teamA.id], mode: 'set', phaseId: p1.id } });

  section('mixed selection moves relative to each row');
  await api('/api/admin/phases/assign', { cookie: aCookie, method: 'POST', body: { teamIds: [teamB.id], mode: 'set', phaseId: p2.id } });
  r = await api('/api/admin/phases/assign', { cookie: aCookie, method: 'POST', body: { teamIds: [teamA.id, teamB.id], mode: 'next' } });
  check('both advanced from their own phase', r.json.moved === 2, JSON.stringify(r.json));
  check('A now phase 2, B now phase 3',
    (await prisma.team.findUnique({ where: { id: teamA.id } })).phaseId === p2.id &&
    (await prisma.team.findUnique({ where: { id: teamB.id } })).phaseId === p3.id);
  const noPhase = await prisma.team.create({ data: { teamName: `${TAG} بلا مرحلة`, status: 'approved' } });
  r = await api('/api/admin/phases/assign', { cookie: aCookie, method: 'POST', body: { teamIds: [noPhase.id], mode: 'next' } });
  check('row with no phase reported as unassigned', r.json.unassigned === 1 && r.json.moved === 0, JSON.stringify(r.json));

  section('fail / clear, and manual override');
  await api('/api/admin/phases/assign', { cookie: aCookie, method: 'POST', body: { teamIds: [teamA.id], mode: 'set', phaseId: p1.id } });
  r = await api('/api/admin/phases/assign', { cookie: aCookie, method: 'POST', body: { teamIds: [teamA.id], mode: 'fail' } });
  let ta = await prisma.team.findUnique({ where: { id: teamA.id } });
  check('marked failed, phase unchanged', ta.phaseStatus === 'failed' && ta.phaseId === p1.id, JSON.stringify({ s: ta.phaseStatus }));
  r = await api('/api/admin/phases/assign', { cookie: aCookie, method: 'POST', body: { teamIds: [teamA.id], mode: 'next' } });
  ta = await prisma.team.findUnique({ where: { id: teamA.id } });
  check('manual move overrides failed and resets it to active',
        r.json.moved === 1 && ta.phaseId === p2.id && ta.phaseStatus === 'active', JSON.stringify({ p: ta.phaseId === p2.id, s: ta.phaseStatus }));
  await api('/api/admin/phases/assign', { cookie: aCookie, method: 'POST', body: { teamIds: [teamA.id], mode: 'fail' } });
  await api('/api/admin/phases/assign', { cookie: aCookie, method: 'POST', body: { teamIds: [teamA.id], mode: 'clear' } });
  check('clear returns it to active', (await prisma.team.findUnique({ where: { id: teamA.id } })).phaseStatus === 'active');

  section('phase update + delete guard');
  r = await api(`/api/admin/phases/${p3.id}`, { cookie: aCookie, method: 'PUT', body: { name: `${TAG} ثالثة معدلة` } });
  check('rename 200', r.status === 200 && r.json.phase.name === `${TAG} ثالثة معدلة`, JSON.stringify(r.json).slice(0, 90));
  r = await api(`/api/admin/phases/${p1.id}`, { cookie: aCookie, method: 'PUT', body: { name: `${TAG} ثانية` } });
  check('rename to an existing name -> 400', r.status === 400, String(r.status));
  r = await api(`/api/admin/phases/${p1.id}`, { cookie: aCookie, method: 'DELETE' });
  check('delete while occupied -> 400 with counts', r.status === 400 && r.json.teams >= 0, JSON.stringify(r.json).slice(0, 120));
  const empty = (await api('/api/admin/phases', { cookie: aCookie, method: 'POST', body: { name: `${TAG} فارغة` } })).json.phase;
  r = await api(`/api/admin/phases/${empty.id}`, { cookie: aCookie, method: 'DELETE' });
  check('delete an empty phase -> 200', r.status === 200, String(r.status));

  section('reorder swaps cleanly (order stays unique)');
  const beforeOrders = (await prisma.phase.findMany({ where: { name: { startsWith: TAG } }, orderBy: { order: 'asc' }, select: { id: true, order: true } }));
  r = await api(`/api/admin/phases/${p1.id}`, { cookie: aCookie, method: 'PUT', body: { order: p2.order } });
  check('swap order 200', r.status === 200, JSON.stringify(r.json).slice(0, 90));
  const orders = (await prisma.phase.findMany({ where: { name: { startsWith: TAG } }, select: { order: true } })).map((x) => x.order);
  check('no duplicate orders after swap', new Set(orders).size === orders.length, JSON.stringify(orders));
  // put it back
  await api(`/api/admin/phases/${p1.id}`, { cookie: aCookie, method: 'PUT', body: { order: beforeOrders[0].order } });


  section('phase-targeted email');
  const settings = await prisma.emailSettings.findFirst();
  const savedSettings = { ...settings }; delete savedSettings.id; delete savedSettings.updatedAt;
  await prisma.emailSettings.update({ where: { id: settings.id }, data: {
    enabled: true, host: '127.0.0.1', port: 2599, secure: false, username: '', password: '',
    fromEmail: `n@${TAG}.test`, fromName: 'T', adminInboxEmail: '' } });
  // teamA -> phase1 (leadA), solo -> phase1, teamB -> phase2 (leadB)
  await api('/api/admin/phases/assign', { cookie: aCookie, method: 'POST', body: { teamIds: [teamA.id], participantIds: [solo.id], mode: 'set', phaseId: p1.id } });
  await api('/api/admin/phases/assign', { cookie: aCookie, method: 'POST', body: { teamIds: [teamB.id], mode: 'set', phaseId: p2.id } });
  await prisma.team.update({ where: { id: teamA.id }, data: { status: 'approved' } });
  await prisma.team.update({ where: { id: teamB.id }, data: { status: 'approved' } });

  const bc = async (audience) => {
    const res = await api('/api/admin/broadcast', { cookie: aCookie, method: 'POST', body: {
      title: `${TAG} ${audience.type}`, body: 'x', emailSubject: `${TAG} m`, channels: ['email'], audience } });
    if (!res.json?.broadcast?.id) return { status: res.status, emails: [], json: res.json };
    const rows = await prisma.broadcastRecipient.findMany({ where: { broadcastId: res.json.broadcast.id }, select: { email: true } });
    return { status: res.status, emails: rows.map((x) => x.email.replace('@t.local', '')) };
  };

  let out = await bc({ type: 'phase', phaseId: p1.id });
  check('phase audience reaches phase-1 members only',
        out.emails.includes(`${TAG}-la`) && out.emails.includes(`${TAG}-solo`) && !out.emails.includes(`${TAG}-lb`),
        JSON.stringify(out.emails));
  out = await bc({ type: 'phase', phaseId: p2.id });
  check('phase 2 audience reaches only team B leader', out.emails.includes(`${TAG}-lb`) && !out.emails.includes(`${TAG}-la`), JSON.stringify(out.emails));
  let miss = await api('/api/admin/broadcast', { cookie: aCookie, method: 'POST', body: {
    title: `${TAG} nop`, body: 'x', emailSubject: 's', channels: ['email'], audience: { type: 'phase' } } });
  check('phase audience without phaseId -> 400', miss.status === 400, String(miss.status));

  await api('/api/admin/phases/assign', { cookie: aCookie, method: 'POST', body: { teamIds: [teamA.id], mode: 'fail' } });
  out = await bc({ type: 'phase-failed', phaseId: p1.id });
  check('phase-failed reaches the failed team only',
        out.emails.includes(`${TAG}-la`) && !out.emails.includes(`${TAG}-solo`), JSON.stringify(out.emails));
  out = await bc({ type: 'phase', phaseId: p1.id });
  check('a failed team still receives normal phase email', out.emails.includes(`${TAG}-la`), JSON.stringify(out.emails));
  await api('/api/admin/phases/assign', { cookie: aCookie, method: 'POST', body: { teamIds: [teamA.id], mode: 'clear' } });

  section('disabling a phase blocks its members');
  await api(`/api/admin/phases/${p1.id}`, { cookie: aCookie, method: 'PUT', body: { isDisabled: true } });
  out = await bc({ type: 'phase', phaseId: p1.id });
  check('disabled phase emails nobody', out.emails.length === 0, JSON.stringify(out.emails));
  out = await bc({ type: 'all-participants' });
  check('members of a disabled phase drop out of all-participants', !out.emails.includes(`${TAG}-la`) && !out.emails.includes(`${TAG}-solo`), JSON.stringify(out.emails));
  out = await bc({ type: 'disabled-accounts' });
  check('…and appear in the disabled-accounts audience', out.emails.includes(`${TAG}-la`) && out.emails.includes(`${TAG}-solo`), JSON.stringify(out.emails));
  await api(`/api/admin/phases/${p1.id}`, { cookie: aCookie, method: 'PUT', body: { isDisabled: false } });
  out = await bc({ type: 'phase', phaseId: p1.id });
  check('re-enabling the phase restores them', out.emails.includes(`${TAG}-la`), JSON.stringify(out.emails));

  section('auto-advance on milestone acceptance');
  const mkMilestone = async (title, phaseId) => {
    const res = await api('/api/admin/milestones', { cookie: aCookie, method: 'POST', body: {
      title, description: 'd', requirements: 'r', status: 'active',
      dueDate: new Date(Date.now() + 864e5).toISOString(), phaseId } });
    return res.json;
  };
  const msP1 = await mkMilestone(`${TAG} تسليم مرحلة 1`, p1.id);
  check('milestone stores its phase', msP1.phaseId === p1.id, JSON.stringify(msP1.phaseId));

  const submit = (participantId, milestoneId) => prisma.milestoneSubmission.create({
    data: { participantId, milestoneId, filePath: 'f', fileName: 'f.pdf', reviewStatus: 'pending' } });
  const review = (milestoneId, submissionId, reviewStatus) => api(
    `/api/admin/milestones/${milestoneId}/submissions/${submissionId}/review`,
    { cookie: aCookie, method: 'POST', body: { reviewStatus, reviewComment: 'ok' } });

  let sub = await submit(leadA.id, msP1.id);
  let rr = await review(msP1.id, sub.id, 'accepted');
  check('accept 200 and reports the advance', rr.status === 200 && rr.json.phaseAdvanced === true, JSON.stringify(rr.json));
  check('team A moved to phase 2', (await prisma.team.findUnique({ where: { id: teamA.id } })).phaseId === p2.id);

  rr = await review(msP1.id, sub.id, 'accepted');
  check('re-accepting is idempotent — no second advance',
        rr.json.phaseAdvanced === false && (await prisma.team.findUnique({ where: { id: teamA.id } })).phaseId === p2.id,
        JSON.stringify(rr.json));

  section('rejection marks failed, resubmission does not');
  await api('/api/admin/phases/assign', { cookie: aCookie, method: 'POST', body: { teamIds: [teamB.id], mode: 'set', phaseId: p1.id } });
  let subB = await submit(leadB.id, msP1.id);
  rr = await review(msP1.id, subB.id, 'rejected');
  let tb = await prisma.team.findUnique({ where: { id: teamB.id } });
  check('rejected -> failed, same phase', tb.phaseStatus === 'failed' && tb.phaseId === p1.id, JSON.stringify({ s: tb.phaseStatus }));
  rr = await review(msP1.id, subB.id, 'needs_resubmission');
  tb = await prisma.team.findUnique({ where: { id: teamB.id } });
  check('needs_resubmission leaves the phase untouched', tb.phaseId === p1.id, String(tb.phaseId === p1.id));
  check('a failed team is not auto-advanced', rr.json.phaseAdvanced !== true);

  section('a milestone with no phase moves nobody');
  const msNone = await mkMilestone(`${TAG} تسليم بلا مرحلة`, null);
  await api('/api/admin/phases/assign', { cookie: aCookie, method: 'POST', body: { teamIds: [teamB.id], mode: 'clear' } });
  const before = (await prisma.team.findUnique({ where: { id: teamB.id } })).phaseId;
  const subN = await submit(leadB.id, msNone.id);
  rr = await review(msNone.id, subN.id, 'accepted');
  check('no phase on the milestone -> no move, with a reason',
        rr.json.phaseAdvanced === false && Boolean(rr.json.phaseReason) &&
        (await prisma.team.findUnique({ where: { id: teamB.id } })).phaseId === before,
        JSON.stringify(rr.json));

  section('an UNASSIGNED team advances as if in the milestone phase');
  // teamB was cleared above (phaseId=null, active). Accepting a phase-1
  // milestone must move it to phase 2 — the production bug was a silent no-op.
  rr = await review(msP1.id, subB.id, 'accepted');
  tb = await prisma.team.findUnique({ where: { id: teamB.id } });
  check('accept advances the unassigned team to phase 2',
        rr.status === 200 && rr.json.phaseAdvanced === true && tb.phaseId === p2.id,
        JSON.stringify({ res: rr.json, phase: tb.phaseId === p2.id }));
  rr = await review(msP1.id, subB.id, 'accepted');
  check('…and re-accepting stays idempotent',
        rr.json.phaseAdvanced === false && (await prisma.team.findUnique({ where: { id: teamB.id } })).phaseId === p2.id,
        JSON.stringify(rr.json));

  await prisma.emailSettings.update({ where: { id: settings.id }, data: savedSettings });

  section('the admin tables receive the phase they render');
  // The teams/participants pages draw a phase badge and per-row move arrows
  // from these payloads, so the shape is part of the contract now.
  await api('/api/admin/phases/assign', { cookie: aCookie, method: 'POST', body: { teamIds: [teamA.id], mode: 'set', phaseId: p1.id } });
  await api('/api/admin/phases/assign', { cookie: aCookie, method: 'POST', body: { participantIds: [solo.id], mode: 'set', phaseId: p2.id } });

  const teamRows = (await api('/api/admin/teams', { cookie: aCookie })).json;
  const rowA = (teamRows || []).find((t) => t.id === teamA.id);
  check('/api/admin/teams returns phaseId + phaseStatus', rowA && rowA.phaseId === p1.id && rowA.phaseStatus === 'active',
        JSON.stringify(rowA && { id: rowA.phaseId, s: rowA.phaseStatus }));
  check('…and the resolved phase object the badge renders',
        rowA && rowA.phase && rowA.phase.id === p1.id && rowA.phase.name.startsWith(TAG) && typeof rowA.phase.isDisabled === 'boolean',
        JSON.stringify(rowA && rowA.phase));

  const partRows = (await api('/api/admin/participants', { cookie: aCookie })).json;
  const rowSolo = (partRows || []).find((x) => x.id === solo.id);
  check('/api/admin/participants returns the phase for individuals',
        rowSolo && rowSolo.phaseId === p2.id && rowSolo.phase && rowSolo.phase.id === p2.id && rowSolo.phase.name.startsWith(TAG),
        JSON.stringify(rowSolo && rowSolo.phase));
  check('…and still hides passwordHash', rowSolo && !('passwordHash' in rowSolo), JSON.stringify(rowSolo && Object.keys(rowSolo).slice(0, 5)));

  section('admin can still set a review back to قيد المراجعة');
  // The review dialog has always offered this; the phase work must not break it.
  const msUndo = await mkMilestone(`${TAG} تراجع`, p1.id);
  const subU = await submit(leadA.id, msUndo.id);
  const undo = await review(msUndo.id, subU.id, 'pending');
  check('pending is accepted, moves nobody', undo.status === 200 && undo.json.phaseAdvanced !== true, JSON.stringify(undo.json));
  check('…and the team stayed put', (await prisma.team.findUnique({ where: { id: teamA.id } })).phaseId === p1.id);

  section('cleanup');
  await prisma.milestoneSubmission.deleteMany({ where: { milestone: { title: { startsWith: TAG } } } });
  await prisma.broadcastRecipient.deleteMany({ where: { broadcast: { title: { startsWith: TAG } } } });
  await prisma.broadcast.deleteMany({ where: { title: { startsWith: TAG } } });
  await prisma.emailLog.deleteMany({ where: { subject: { startsWith: TAG } } });
  // review-notification emails carry template subjects (no TAG prefix) — the
  // recipient address is the reliable fixture marker
  await prisma.emailLog.deleteMany({ where: { toEmail: { startsWith: TAG } } });
  await prisma.notification.deleteMany({ where: { title: { startsWith: TAG } } });
  await prisma.milestone.deleteMany({ where: { title: { startsWith: TAG } } });
  await prisma.participant.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.team.deleteMany({ where: { teamName: { startsWith: TAG } } });
  await prisma.phase.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.admin.delete({ where: { id: admin.id } });
  console.log('  cleaned up');

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('CRASH', e); await prisma.$disconnect(); process.exit(1); });
