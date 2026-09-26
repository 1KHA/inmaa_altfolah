#!/usr/bin/env node
/**
 * Point the app's e-mail settings at a local Mailpit and switch sending on.
 *
 * SMTP credentials are not read from env — they live in the EmailSettings row,
 * so a fresh database has e-mail disabled until an admin fills the form in
 * /admin-hackton-dashboard/settings. This does that from the CLI for local
 * testing, against whatever DATABASE_URL is exported.
 *
 *   # the containerised app reaches Mailpit by service name
 *   DATABASE_URL=postgresql://mayda:...@127.0.0.1:55432/mayda \
 *     node scripts/dev/use-mailpit.js mailpit 1025
 *
 *   # a host-run `next dev`/`next start` reaches it on loopback. Use the literal
 *   # 127.0.0.1, not "localhost": resolving the name inside the Node process
 *   # stalls for minutes on macOS before it falls back to IPv4.
 *   DATABASE_URL=... node scripts/dev/use-mailpit.js 127.0.0.1 1025
 *
 * Refuses to touch anything that is not a local database.
 */
const { PrismaClient } = require('@prisma/client');

const host = process.argv[2] || '127.0.0.1';
const port = Number(process.argv[3] || 1025);

const url = process.env.DATABASE_URL || '';
const isLocal = /@(localhost|127\.0\.0\.1|db|host\.docker\.internal)[:/]/.test(url);
if (!isLocal) {
  console.error('refusing to run: DATABASE_URL does not look local —', url.replace(/:[^:@]*@/, ':***@') || '(unset)');
  process.exit(1);
}

const prisma = new PrismaClient();
(async () => {
  const existing = await prisma.emailSettings.findFirst();
  const data = {
    host,
    port,
    secure: false,
    username: '',
    password: '',
    fromEmail: 'noreply@localhost.test',
    fromName: 'جائزة مايدة محي الدين ناظر للابتكار',
    adminInboxEmail: 'admins@localhost.test',
    enabled: true,
  };
  const row = existing
    ? await prisma.emailSettings.update({ where: { id: existing.id }, data })
    : await prisma.emailSettings.create({ data: { id: 'emailsettings-default-row-01', ...data } });
  console.log(`e-mail enabled -> ${row.host}:${row.port} (from ${row.fromEmail})`);
  await prisma.$disconnect();
})();
