/**
 * Fake Mandrill "messages/send" API for local tests.
 *
 *   node scripts/tests/fake-mandrill.js            (listens on 127.0.0.1:2580)
 *   MANDRILL_API_URL=http://127.0.0.1:2580/send MAILCHIMP_API_KEY=test-key MAIL_FROM=noreply@test.local npx next start …
 *
 * Behaviour per recipient address (mirrors Mandrill's per-recipient verdicts):
 *   contains "bounce"  → { status: 'rejected', reject_reason: 'hard-bounce' }
 *   contains "invalid" → { status: 'invalid' }
 *   contains "quota"   → { status: 'queued' }   (over hourly quota — still accepted)
 *   otherwise          → { status: 'sent', _id }
 * A call whose recipients include an address containing "flaky" fails ONCE
 * with a Mandrill-style error object (simulated outage); the next call succeeds.
 *
 *   GET /requests → every recorded request body   GET /reset → clear
 */
const http = require('http');
const PORT = Number(process.env.FAKE_MANDRILL_PORT || 2580);

let requests = [];
let flakyFailed = new Set();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'GET' && url.pathname === '/requests') {
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ requests }));
  }
  if (req.method === 'GET' && url.pathname === '/reset') {
    requests = []; flakyFailed = new Set();
    return res.end('ok');
  }
  if (req.method !== 'POST') { res.statusCode = 404; return res.end(); }

  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    let body;
    try { body = JSON.parse(raw); } catch { res.statusCode = 400; return res.end('bad json'); }
    requests.push({ at: Date.now(), path: url.pathname, key: body.key, message: body.message });
    res.setHeader('content-type', 'application/json');

    if (body.key !== (process.env.FAKE_MANDRILL_KEY || 'test-key')) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ status: 'error', code: -1, name: 'Invalid_Key', message: 'Invalid API key' }));
    }
    const to = (body.message?.to || []).map((t) => t.email);
    const flaky = to.find((e) => /flaky/i.test(e));
    if (flaky && !flakyFailed.has(flaky)) {
      flakyFailed.add(flaky);
      res.statusCode = 500;
      return res.end(JSON.stringify({ status: 'error', code: -1, name: 'GeneralError', message: 'simulated outage' }));
    }
    const results = to.map((email, i) => {
      if (/bounce/i.test(email)) return { email, status: 'rejected', reject_reason: 'hard-bounce', _id: null };
      if (/invalid/i.test(email)) return { email, status: 'invalid', reject_reason: null, _id: null };
      if (/quota/i.test(email)) return { email, status: 'queued', reject_reason: null, _id: `q-${requests.length}-${i}` };
      return { email, status: 'sent', reject_reason: null, _id: `m-${requests.length}-${i}` };
    });
    res.end(JSON.stringify(results));
  });
});

server.listen(PORT, '127.0.0.1', () => console.log(`fake mandrill on http://127.0.0.1:${PORT}/send`));
