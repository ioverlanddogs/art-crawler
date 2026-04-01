import { PrismaClient } from '../generated/prisma/index.js';

const PERMANENT_ADMIN_EMAIL = 'myspchosting@gmail.com';

function assertDatabaseEnv() {
  const missing = ['DATABASE_URL', 'DATABASE_URL_DIRECT'].filter((key) => {
    const value = process.env[key];
    return !value || value.trim().length === 0;
  });

  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  }
}

async function main() {
  assertDatabaseEnv();

  const prisma = new PrismaClient({ log: ['error'] });

  try {
    await prisma.$connect();

    const adminUser = await prisma.adminUser.upsert({
      where: { email: PERMANENT_ADMIN_EMAIL },
      create: {
        email: PERMANENT_ADMIN_EMAIL,
        name: 'System Admin',
        role: 'admin',
        status: 'ACTIVE'
      },
      update: {
        role: 'admin',
        status: 'ACTIVE'
      }
    });

    console.log(`Ensured permanent admin user is active: ${adminUser.email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    console.log('seed-permanent-admin finished successfully.');
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`seed-permanent-admin failed: ${message}`);
    process.exitCode = 1;
  });
