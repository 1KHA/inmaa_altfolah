/**
 * Local SMTP sink for the e2e suites that assert on real outgoing mail
 * (`e2e-acceptance-credentials.js`, `e2e-broadcast-queue.js`).
 *
 * Speaks just enough SMTP to accept a message, decodes the parts those tests
 * read, and serves them over HTTP:
 *
 *   SMTP   127.0.0.1:2525        (SMTP_SINK_HOST / SMTP_SINK_PORT)
 *   GET    http://127.0.0.1:2526/mails   -> { mails: [{ rcpt: [], text, subject }] }
 *   GET    http://127.0.0.1:2526/reset   -> clears the buffer
 *
 * `BOUNCE_SUBSTRING` (default "bounce") makes any matching recipient get a 550
 * so the queue suite can exercise the failure path.
 *
 *   node scripts/tests/smtp-sink.js &
 */
const net = require('net');
const http = require('http');

const SMTP_PORT = Number(process.env.SMTP_SINK_PORT || 2525);
const HTTP_PORT = Number(process.env.SMTP_SINK_HTTP_PORT || 2526);
const HOST = process.env.SMTP_SINK_HOST || '127.0.0.1';
const BOUNCE = process.env.BOUNCE_SUBSTRING || 'bounce';

/** @type {{rcpt: string[], text: string, subject: string, raw: string}[]} */
let mails = [];

/** RFC 2047 encoded-words — the Arabic subjects arrive as =?UTF-8?B?…?=. */
function decodeWords(value) {
  return value.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_m, charset, enc, data) => {
    try {
      if (enc.toUpperCase() === 'B') return Buffer.from(data, 'base64').toString('utf8');
      return Buffer.from(data.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_x, h) => String.fromCharCode(parseInt(h, 16))), 'binary').toString('utf8');
    } catch { return data; }
  });
}

function decodeBody(raw) {
  const sepIndex = raw.indexOf('\r\n\r\n');
  const headerBlock = sepIndex === -1 ? raw : raw.slice(0, sepIndex);
  let body = sepIndex === -1 ? '' : raw.slice(sepIndex + 4);
  const headers = headerBlock.replace(/\r\n[ \t]+/g, ' ');

  const subject = decodeWords((headers.match(/^Subject:\s*(.*)$/im) || [, ''])[1].trim());
  const boundary = (headers.match(/boundary="?([^";\r\n]+)"?/i) || [])[1];

  // Collect every part so the tests can grep one string for the whole message.
  const parts = boundary
    ? body.split(`--${boundary}`).slice(1, -1)
    : [`\r\n\r\n${body}`];

  const decoded = parts.map((part) => {
    const idx = part.indexOf('\r\n\r\n');
    const partHeaders = idx === -1 ? part : part.slice(0, idx);
    let content = idx === -1 ? '' : part.slice(idx + 4);
    const encoding = (partHeaders.match(/Content-Transfer-Encoding:\s*(\S+)/i) || [, '7bit'])[1].toLowerCase();
    if (encoding === 'base64') {
      content = Buffer.from(content.replace(/\s/g, ''), 'base64').toString('utf8');
    } else if (encoding === 'quoted-printable') {
      content = content
        .replace(/=\r\n/g, '')
        .replace(/=([0-9A-Fa-f]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)));
      content = Buffer.from(content, 'binary').toString('utf8');
    }
    return content;
  });

  return { subject, text: `${subject}\n${decoded.join('\n')}` };
}

net.createServer((socket) => {
  let buffer = '';
  let state = 'cmd';
  let rcpt = [];
  let data = '';
  const send = (line) => socket.write(line + '\r\n');

  send('220 sink ready');
  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8');

    for (;;) {
      if (state === 'data') {
        const end = buffer.indexOf('\r\n.\r\n');
        if (end === -1) return;
        data = buffer.slice(0, end);
        buffer = buffer.slice(end + 5);
        const { subject, text } = decodeBody(data);
        mails.push({ rcpt: [...rcpt], text, subject, raw: data });
        rcpt = [];
        data = '';
        state = 'cmd';
        send('250 OK queued');
        continue;
      }

      const nl = buffer.indexOf('\r\n');
      if (nl === -1) return;
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 2);
      const upper = line.toUpperCase();

      if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
        send('250-sink');
        send('250-8BITMIME');
        send('250 AUTH PLAIN LOGIN');
      } else if (upper.startsWith('AUTH')) {
        send('235 authenticated');
      } else if (upper.startsWith('MAIL FROM')) {
        send('250 OK');
      } else if (upper.startsWith('RCPT TO')) {
        const address = (line.match(/<([^>]*)>/) || [, ''])[1];
        // One address always bounces, so the queue's failure path is real.
        if (BOUNCE && address.includes(BOUNCE)) {
          send('550 rejected by SMTP server');
        } else {
          rcpt.push(address);
          send('250 OK');
        }
      } else if (upper.startsWith('DATA')) {
        state = 'data';
        send('354 send it');
      } else if (upper.startsWith('QUIT')) {
        send('221 bye');
        socket.end();
        return;
      } else if (upper.startsWith('RSET')) {
        rcpt = [];
        send('250 OK');
      } else {
        send('250 OK');
      }
    }
  });
  socket.on('error', () => { /* clients hang up mid-session; not our problem */ });
}).listen(SMTP_PORT, HOST, () => console.log(`[sink] SMTP  ${HOST}:${SMTP_PORT}`));

http.createServer((req, res) => {
  const url = (req.url || '').split('?')[0];
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (url === '/reset' || url === '/reset/') {
    mails = [];
    return res.end(JSON.stringify({ ok: true }));
  }
  if (url === '/mails' || url === '/mails/') {
    return res.end(JSON.stringify({ mails: mails.map(({ rcpt, text, subject }) => ({ rcpt, text, subject })) }));
  }
  res.end(JSON.stringify({ count: mails.length }));
}).listen(HTTP_PORT, HOST, () => console.log(`[sink] stats http://${HOST}:${HTTP_PORT}/`));
