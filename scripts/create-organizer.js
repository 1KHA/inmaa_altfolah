/**
 * Manage organizer (منظم) accounts — door staff who can only scan badges for
 * the general check-in and look up active participants (/organizer-login).
 *
 * Uses DATABASE_URL from the environment. Touches only the Organizer table.
 *
 *   node scripts/create-organizer.js <username> "<display name>" [password]
 *   node scripts/create-organizer.js --reset-password <username> [password]
 *   node scripts/create-organizer.js --disable <username>
 *   node scripts/create-organizer.js --enable <username>
 *   node scripts/create-organizer.js --list
 *
 * A password is generated when none is given; it is printed once and only its
 * bcrypt hash is stored.
 */
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// no 0/O/1/l/I — easy to read aloud and type on a phone
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
function generatePassword(length = 12) {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

function usage() {
  console.log(
    'usage:\n' +
      '  node scripts/create-organizer.js <username> "<display name>" [password]\n' +
      '  node scripts/create-organizer.js --reset-password <username> [password]\n' +
      '  node scripts/create-organizer.js --disable <username>\n' +
      '  node scripts/create-organizer.js --enable <username>\n' +
      '  node scripts/create-organizer.js --list'
  );
  process.exit(1);
}

async function main() {
  const [cmd, a, b] = process.argv.slice(2);
  if (!cmd) usage();

  if (cmd === '--list') {
    const rows = await prisma.organizer.findMany({
      orderBy: { createdAt: 'asc' },
      select: { username: true, name: true, isDisabled: true, createdAt: true },
    });
    console.table(rows);
    return;
  }

  if (cmd === '--disable' || cmd === '--enable') {
    if (!a) usage();
    await prisma.organizer.update({ where: { username: a }, data: { isDisabled: cmd === '--disable' } });
    console.log(`${a}: ${cmd === '--disable' ? 'disabled' : 'enabled'}`);
    return;
  }

  if (cmd === '--reset-password') {
    if (!a) usage();
    const password = b || generatePassword();
    await prisma.organizer.update({ where: { username: a }, data: { passwordHash: await bcrypt.hash(password, 10) } });
    console.log(`${a}: new password: ${password}`);
    return;
  }

  if (cmd.startsWith('--')) usage();
  const username = cmd.trim();
  const name = (a || '').trim();
  if (!username || !name) usage();
  if (await prisma.organizer.findUnique({ where: { username } })) {
    console.error(`organizer "${username}" already exists — use --reset-password to change its password`);
    process.exit(1);
  }
  const password = b || generatePassword();
  await prisma.organizer.create({
    data: { username, name, passwordHash: await bcrypt.hash(password, 10) },
  });
  console.log(`created organizer  username: ${username}  name: ${name}  password: ${password}`);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
