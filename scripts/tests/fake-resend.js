/**
 * Fake Resend "POST /emails/batch" API for local tests.
 *
 *   node scripts/tests/fake-resend.js              (listens on 127.0.0.1:2580)
 *   RESEND_API_URL=http://127.0.0.1:2580 RESEND_API_KEY=test-key MAIL_FROM=noreply@test.local npx next start …
 *
 * Mirrors the real API where the app depends on it:
 *   - Authorization: Bearer <key>; any other key → 403 validation_error
 *   - ≤100 emails per call, each `to` ≤50 addresses
 *   - `x-batch-validation: permissive` → invalid items listed in `errors`
 *     ({ index, message }) and the rest sent; without the header (strict, the
 *     API default) one invalid item fails the whole call with 422
 *
 * Behaviour per recipient address:
 *   contains "invalid"   → refused by validation (permanent)
 *   contains "ratelimit" → the first call carrying it gets 429 rate_limit_exceeded
 *                          with retry-after: 1; the next call succeeds
 *   contains "flaky"     → the first call carrying it fails with 500
 *                          application_error (simulated outage); the next succeeds
 *   otherwise            → accepted, { id }
 *
 * Optional: MAILPIT_SMTP=127.0.0.1:1025 relays every accepted email to
 * Mailpit over SMTP, so the rendered mail can be read in Mailpit's UI while
 * the app runs its real Resend code path — no live sends.
 *
 *   GET /requests → every recorded request   GET /reset → clear
 */
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const PORT = Number(process.env.FAKE_RESEND_PORT || 2580);
const KEY = process.env.FAKE_RESEND_KEY || 'test-key';

let relay = null;
if (process.env.MAILPIT_SMTP) {
  const nodemailer = require(path.join(__dirname, '..', '..', 'node_modules', 'nodemailer'));
  const [host, port] = process.env.MAILPIT_SMTP.split(':');
  relay = nodemailer.createTransport({ host, port: Number(port || 1025), secure: false });
}

let requests = [];
let tripped = new Set(); // addresses whose one-off failure has fired

const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
};
const error = (res, status, name, message, headers) => json(res, status, { statusCode: status, name, message }, headers);
const recipientsOf = (email) => [].concat(email.to || []);
const oneOff = (emails, pattern) => {
  const hit = emails.flatMap(recipientsOf).find((a) => pattern.test(a) && !tripped.has(a));
  if (hit) tripped.add(hit);
  return hit;
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'GET' && url.pathname === '/requests') return json(res, 200, { requests });
  if (req.method === 'GET' && url.pathname === '/reset') { requests = []; tripped = new Set(); return res.end('ok'); }
  if (req.method !== 'POST' || url.pathname !== '/emails/batch') return error(res, 404, 'not_found', 'not found');

  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', async () => {
    let emails;
    try { emails = JSON.parse(raw); } catch { return error(res, 400, 'validation_error', 'invalid JSON'); }
    const auth = req.headers.authorization || '';
    const validation = req.headers['x-batch-validation'] || 'strict';
    requests.push({ at: Date.now(), path: url.pathname, auth, validation, emails });

    if (!auth.startsWith('Bearer ')) return error(res, 401, 'missing_api_key', 'Missing API key in the authorization header');
    if (auth.slice(7) !== KEY) return error(res, 403, 'validation_error', 'API key is invalid');
    if (!Array.isArray(emails) || emails.length === 0) return error(res, 422, 'validation_error', 'body must be a non-empty array');
    if (emails.length > 100) return error(res, 422, 'validation_error', 'Too many emails in batch, max 100');

    if (oneOff(emails, /ratelimit/i)) return error(res, 429, 'rate_limit_exceeded', 'Too many requests', { 'retry-after': '1' });
    if (oneOff(emails, /flaky/i)) return error(res, 500, 'application_error', 'simulated outage');

    const errors = [];
    emails.forEach((e, index) => {
      const to = recipientsOf(e);
      if (!e.from || !e.subject || to.length === 0) errors.push({ index, message: 'Missing `from`, `to` or `subject`' });
      else if (to.length > 50) errors.push({ index, message: 'Too many recipients in `to`, max 50' });
      else if (to.some((a) => /invalid/i.test(a) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a))) errors.push({ index, message: 'Invalid `to` field. The email address needs to follow the `email@example.com` format.' });
    });
    if (errors.length > 0 && validation !== 'permissive') return error(res, 422, 'validation_error', errors[0].message);

    const refused = new Set(errors.map((e) => e.index));
    const data = [];
    for (const [index, e] of emails.entries()) {
      if (refused.has(index)) continue;
      data.push({ id: crypto.randomUUID() });
      if (relay) {
        await relay.sendMail({ from: e.from, to: recipientsOf(e), subject: e.subject, html: e.html, text: e.text })
          .catch((err) => console.error(`mailpit relay failed: ${err.message}`));
      }
    }
    json(res, 200, errors.length > 0 ? { data, errors } : { data });
  });
});

server.listen(PORT, '127.0.0.1', () =>
  console.log(`fake resend on http://127.0.0.1:${PORT}${relay ? ` (relaying to Mailpit ${process.env.MAILPIT_SMTP})` : ''}`));
