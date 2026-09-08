/**
 * Login failure feedback.
 *
 * Two bugs motivated this suite:
 *
 *  1. /admin-login called `showAdminToast`, but <AdminToaster /> is mounted
 *     ONLY inside the admin dashboard layout — /admin-login sits outside it.
 *     Every error toast was dispatched into a void, so a wrong password
 *     produced no feedback at all.
 *
 *  2. auth-context's login() returned a bare boolean, discarding the API's
 *     specific reason. "wrong password", "account not activated" and "team not
 *     approved" all collapsed into one generic string — so a user whose team
 *     simply wasn't approved yet would keep retrying a correct password.
 *
 * Client-side rendering can't be driven headlessly, so this asserts the two
 * things that are verifiable: the API really does distinguish these cases
 * (i.e. there is a reason worth surfacing), and the pages are wired to the
 * toaster that is actually mounted.
 */
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '../..');
const bcrypt = require(path.join(REPO, 'node_modules/bcryptjs'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const TAG = `loginerr${Date.now()}`;
const GOOD_PASSWORD = 'CorrectHorse!2026';

let pass = 0, fail = 0;
const made = { participants: [], teams: [] };

function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  -> ' + detail : ''}`); }
}
const section = (s) => console.log(`\n--- ${s} ---`);

async function post(url, body) {
  const res = await fetch(BASE + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

async function main() {
  const hash = await bcrypt.hash(GOOD_PASSWORD, 10);

  // approved team + activated participant = the happy path
  const okTeam = await prisma.team.create({ data: { teamName: `${TAG} معتمد`, status: 'approved', isTeamRegistration: true } });
  const okUser = await prisma.participant.create({
    data: { email: `${TAG}-ok@t.test`, fullName: 'مستخدم سليم', teamId: okTeam.id, status: 'approved', passwordHash: hash },
  });

  // participant with NO password set = account not activated
  const inactiveUser = await prisma.participant.create({
    data: { email: `${TAG}-inactive@t.test`, fullName: 'غير مفعل', status: 'pending' },
  });

  // participant on a team that is still pending approval
  const pendingTeam = await prisma.team.create({ data: { teamName: `${TAG} معلق`, status: 'pending', isTeamRegistration: true } });
  const pendingUser = await prisma.participant.create({
    data: { email: `${TAG}-pending@t.test`, fullName: 'فريق معلق', teamId: pendingTeam.id, status: 'approved', passwordHash: hash },
  });

  made.teams.push(okTeam.id, pendingTeam.id);
  made.participants.push(okUser.id, inactiveUser.id, pendingUser.id);

  section('participant login — the API distinguishes each failure reason');

  const wrongPass = await post('/api/login', { email: okUser.email, password: 'not-the-password' });
  check('wrong password -> 401', wrongPass.status === 401, `status=${wrongPass.status}`);
  check('  reason: Invalid credentials', wrongPass.json?.error === 'Invalid credentials', JSON.stringify(wrongPass.json));

  const unknownEmail = await post('/api/login', { email: `${TAG}-ghost@t.test`, password: 'whatever' });
  check('unknown email -> 401', unknownEmail.status === 401, `status=${unknownEmail.status}`);
  check('  reason: Invalid credentials (no user enumeration)',
    unknownEmail.json?.error === 'Invalid credentials', JSON.stringify(unknownEmail.json));

  const inactive = await post('/api/login', { email: inactiveUser.email, password: GOOD_PASSWORD });
  check('account with no password set -> 401', inactive.status === 401, `status=${inactive.status}`);
  check('  reason is DISTINCT from wrong-password (account not activated)',
    inactive.json?.error === 'Account not activated. Please wait for admin approval.' &&
    inactive.json?.error !== wrongPass.json?.error,
    JSON.stringify(inactive.json));

  const teamPending = await post('/api/login', { email: pendingUser.email, password: GOOD_PASSWORD });
  check('correct password but team unapproved -> 401', teamPending.status === 401, `status=${teamPending.status}`);
  check('  reason is DISTINCT (team not approved) — the case a generic message hid',
    teamPending.json?.error === 'Your team is not yet approved' &&
    teamPending.json?.error !== wrongPass.json?.error,
    JSON.stringify(teamPending.json));

  const missing = await post('/api/login', { email: '', password: '' });
  check('empty fields -> 400 with its own reason',
    missing.status === 400 && missing.json?.error === 'Email and password are required',
    `status=${missing.status} ${JSON.stringify(missing.json)}`);

  const good = await post('/api/login', { email: okUser.email, password: GOOD_PASSWORD });
  check('correct credentials still succeed (no regression)',
    good.status === 200 && good.json?.success === true && good.json?.user?.role === 'participant',
    `status=${good.status} ${JSON.stringify(good.json)}`);

  section('admin login — errors are returned and already Arabic');

  const admin = await prisma.admin.findFirst({ select: { username: true } });
  const adminWrong = await post('/api/admin/login', { username: admin.username, password: 'definitely-wrong' });
  check('wrong admin password -> 401', adminWrong.status === 401, `status=${adminWrong.status}`);
  check('  returns an Arabic error string the page can display directly',
    typeof adminWrong.json?.error === 'string' && /[؀-ۿ]/.test(adminWrong.json.error),
    JSON.stringify(adminWrong.json));

  const adminGhost = await post('/api/admin/login', { username: `${TAG}-ghost`, password: 'x' });
  check('unknown admin -> 401 with the same message (no enumeration)',
    adminGhost.status === 401 && adminGhost.json?.error === adminWrong.json?.error);

  section('pages are wired to a toaster that is actually mounted');

  const rootLayout = fs.readFileSync(path.join(REPO, 'src/app/layout.tsx'), 'utf8');
  const adminLoginSrc = fs.readFileSync(path.join(REPO, 'src/app/admin-login/page.tsx'), 'utf8');
  const loginSrc = fs.readFileSync(path.join(REPO, 'src/app/login/page.tsx'), 'utf8');

  check('root layout mounts <Toaster /> (the shadcn one)', /<Toaster\s*\/>/.test(rootLayout));

  // The 'fixed toast' migration (commit 0589301) replaced the dashboard-local
  // <AdminToaster /> with the single root-layout <Toaster /> above, which is
  // mounted for EVERY page — /admin-login included. That one assertion already
  // covers what the old per-dashboard check guarded, so all that remains to
  // pin here is that no page still dispatches into the removed legacy toaster.
  const stripComments = (src) => src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const legacyCallers = ['src/app/admin-login/page.tsx', 'src/app/admin-hackton-dashboard/layout.tsx']
    .map((f) => stripComments(fs.readFileSync(path.join(REPO, f), 'utf8')));
  check('no page mounts or dispatches to the removed legacy AdminToaster',
    legacyCallers.every((src) => !/<AdminToaster\s*\/>/.test(src) && !/^\s*showAdminToast\(/m.test(src)));

  check('/admin-login no longer CALLS showAdminToast (it had no renderer)',
    !/^\s*showAdminToast\(/m.test(adminLoginSrc));
  check('/admin-login now uses useToast', /useToast\(\)/.test(adminLoginSrc));

  section('both pages render a persistent inline error, not just a 5s toast');
  for (const [label, src] of [['/login', loginSrc], ['/admin-login', adminLoginSrc]]) {
    check(`${label} tracks an errorMessage state`, /errorMessage/.test(src));
    check(`  ${label} renders it in a role="alert" region`, /role="alert"/.test(src));
    check(`  ${label} clears it when a new attempt starts`, /setErrorMessage\(null\)/.test(src));
    check(`  ${label} keeps the form visible during submit (authLoading && !isLoading)`,
      /authLoading && !isLoading/.test(src));
  }
}

main()
  .catch((e) => { fail++; console.error('SCRIPT ERROR:', e.stack); })
  .finally(async () => {
    section('cleanup');
    await prisma.notification.deleteMany({ where: { recipientId: { in: made.participants } } });
    await prisma.participant.deleteMany({ where: { id: { in: made.participants } } });
    await prisma.team.deleteMany({ where: { id: { in: made.teams } } });
    console.log(`  DB — participants: ${await prisma.participant.count()}, teams: ${await prisma.team.count()}`);
    console.log(`\n${pass} passed, ${fail} failed`);
    await prisma.$disconnect();
    process.exit(fail === 0 ? 0 : 1);
  });
