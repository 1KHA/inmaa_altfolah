/**
 * Phase 1 e2e: email settings API, encryption at rest, SMTP test button
 * against Mailpit, auth gates, settings page render.
 */
const path = require('path');
const REPO = '/Users/kha/Documents/Code/dyam_hackathon/dhwmk_alvira';
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const MAILPIT = process.env.MAILPIT_URL || 'http://localhost:8025';
const SECRET = process.env.JWT_SECRET;

let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  -> ' + detail : ''}`); }
}
const section = (s) => console.log(`\n--- ${s} ---`);

async function api(p, { cookie, method = 'GET', body } = {}) {
  const res = await fetch(BASE + p, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

const mailpit = async (p, opts) => (await fetch(MAILPIT + p, opts)).json().catch(() => null);
const clearMailpit = () => fetch(MAILPIT + '/api/v1/messages', { method: 'DELETE' });

async function main() {
  const admin = await prisma.admin.findFirst({ select: { id: true, username: true } });
  const aCookie = 'token=' + jwt.sign({ id: admin.id, username: admin.username, role: 'admin' }, SECRET, { expiresIn: '30m' });
  const pCookie = 'token=' + jwt.sign({ id: 'x', participantId: 'x', role: 'participant' }, SECRET, { expiresIn: '30m' });

  // snapshot to restore at the end
  const original = await prisma.emailSettings.findFirst();

  await clearMailpit();

  section('auth gates');
  for (const [label, req] of [
    ['GET email-settings no cookie', await api('/api/admin/email-settings')],
    ['PUT email-settings no cookie', await api('/api/admin/email-settings', { method: 'PUT', body: {} })],
    ['POST test no cookie', await api('/api/admin/email-settings/test', { method: 'POST', body: { toEmail: 'a@b.c' } })],
    ['GET email-settings as participant', await api('/api/admin/email-settings', { cookie: pCookie })],
  ]) {
    check(`${label} -> 401`, req.status === 401, `status=${req.status}`);
  }

  section('settings CRUD + encryption');
  const initial = await api('/api/admin/email-settings', { cookie: aCookie });
  check('GET returns settings with masked password', initial.status === 200 && !('password' in initial.json),
    `status=${initial.status} keys=${Object.keys(initial.json || {}).join(',')}`);
  check('  hasPassword=false on fresh row', initial.json.hasPassword === false);

  const put = await api('/api/admin/email-settings', {
    method: 'PUT', cookie: aCookie,
    body: {
      host: 'localhost', port: Number(process.env.MAILPIT_SMTP_PORT || 1025), secure: false,
      username: '', password: 'super-secret-smtp-pass',
      fromEmail: 'noreply@example.test', fromName: 'منصة دِيَم',
      adminInboxEmail: 'admins@example.test', enabled: false,
    },
  });
  check('PUT saves settings', put.status === 200 && put.json.host === 'localhost', `status=${put.status}`);
  check('  response masks password, hasPassword=true', !('password' in put.json) && put.json.hasPassword === true);

  const rowAfterPut = await prisma.emailSettings.findFirst();
  check('password ENCRYPTED at rest (enc:v1: prefix)', rowAfterPut.password.startsWith('enc:v1:'),
    rowAfterPut.password.slice(0, 12));
  check('  ciphertext does not contain the plaintext', !rowAfterPut.password.includes('super-secret-smtp-pass'));

  // blank password keeps the stored one
  const put2 = await api('/api/admin/email-settings', {
    method: 'PUT', cookie: aCookie, body: { fromName: 'منصة دِيَم — محدث' },
  });
  const rowAfterPut2 = await prisma.emailSettings.findFirst();
  check('blank-password PUT keeps stored password',
    put2.status === 200 && rowAfterPut2.password === rowAfterPut.password && put2.json.hasPassword === true);
  check('  other fields updated', rowAfterPut2.fromName === 'منصة دِيَم — محدث');

  const badPort = await api('/api/admin/email-settings', {
    method: 'PUT', cookie: aCookie, body: { port: 99999 },
  });
  check('invalid port rejected with 400', badPort.status === 400, `status=${badPort.status}`);

  section('test button -> Mailpit');
  // unsaved values: post different fromName than saved, targeting Mailpit
  const test = await api('/api/admin/email-settings/test', {
    method: 'POST', cookie: aCookie,
    body: {
      toEmail: 'tester@example.test',
      host: 'localhost', port: Number(process.env.MAILPIT_SMTP_PORT || 1025), secure: false, username: '',
      fromEmail: 'unsaved-values@example.test', fromName: 'اختبار غير محفوظ',
    },
  });
  check('test send succeeds', test.status === 200 && test.json.success === true,
    `status=${test.status} ${JSON.stringify(test.json)}`);

  await new Promise(r => setTimeout(r, 500));
  const inbox = await mailpit('/api/v1/messages');
  check('email arrived in Mailpit', inbox && inbox.total === 1, `total=${inbox?.total}`);
  const msg = inbox.messages[0];
  check('  correct recipient', msg.To.some(t => t.Address === 'tester@example.test'),
    JSON.stringify(msg.To));
  check('  sent with the UNSAVED from address', msg.From.Address === 'unsaved-values@example.test',
    msg.From.Address);
  check('  Arabic subject intact', msg.Subject.includes('رسالة اختبار'), msg.Subject);

  const full = await mailpit(`/api/v1/message/${msg.ID}`);
  check('  RTL wrapper present in HTML body', full.HTML.includes('dir="rtl"'));
  check('  Arabic body text present', full.HTML.includes('إعدادات SMTP'));

  // blank posted password falls back to saved — send again with no password field
  const test2 = await api('/api/admin/email-settings/test', {
    method: 'POST', cookie: aCookie, body: { toEmail: 'tester2@example.test' },
  });
  check('test with saved settings (blank overrides) succeeds', test2.status === 200 && test2.json.success === true,
    `status=${test2.status} ${JSON.stringify(test2.json)}`);

  // failure path: dead port
  const testFail = await api('/api/admin/email-settings/test', {
    method: 'POST', cookie: aCookie,
    body: { toEmail: 'x@y.z', host: 'localhost', port: 19999, fromEmail: 'a@b.c' },
  });
  check('dead-port test returns failure + error string',
    testFail.status === 502 && testFail.json.success === false && typeof testFail.json.error === 'string',
    `status=${testFail.status} err=${testFail.json?.error?.slice(0, 60)}`);

  const noEmail = await api('/api/admin/email-settings/test', {
    method: 'POST', cookie: aCookie, body: { toEmail: 'not-an-email' },
  });
  check('invalid toEmail rejected 400', noEmail.status === 400, `status=${noEmail.status}`);

  section('settings page');
  const page = await fetch(BASE + '/admin-hackton-dashboard/settings');
  check('settings page responds 200', page.status === 200, `status=${page.status}`);

  // restore original settings row
  await prisma.emailSettings.update({
    where: { id: original.id },
    data: {
      host: original.host, port: original.port, secure: original.secure,
      username: original.username, password: original.password,
      fromEmail: original.fromEmail, fromName: original.fromName,
      adminInboxEmail: original.adminInboxEmail, enabled: original.enabled,
    },
  });
  await clearMailpit();
}

main()
  .catch((e) => { fail++; console.error('\nSCRIPT ERROR:', e.stack); })
  .finally(async () => {
    console.log(`\n${pass} passed, ${fail} failed`);
    await prisma.$disconnect();
    process.exit(fail === 0 ? 0 : 1);
  });
