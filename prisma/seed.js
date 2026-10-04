const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Starting seeding...');

  // Create admin accounts
  const adminPassword1 = await bcrypt.hash('Admin@3300', 10);
  const adminPassword2 = await bcrypt.hash('Admin@3300', 10);
  const adminPassword3 = await bcrypt.hash('Admin@3300', 10);

  const admin1 = await prisma.admin.upsert({
    where: { username: 'admin1' },
    update: {},
    create: {
      username: 'admin1',
      passwordHash: adminPassword1,
    },
  });

  const admin2 = await prisma.admin.upsert({
    where: { username: 'admin2' },
    update: {},
    create: {
      username: 'admin2',
      passwordHash: adminPassword2,
    },
  });

  const admin3 = await prisma.admin.upsert({
    where: { username: 'inmaa' },
    update: {},
    create: {
      username: 'inmaa',
      passwordHash: adminPassword3,
    },
  });

  console.log('Admin accounts created:');
  console.log(`- ${admin1.username}`);
  console.log(`- ${admin2.username}`);
  console.log(`- ${admin3.username}`);

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
