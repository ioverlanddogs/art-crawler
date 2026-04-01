import { PrismaClient } from '../generated/prisma/index.js';
import { hashPassword } from '../lib/password.js';

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

  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  if (!email) {
    throw new Error('BOOTSTRAP_ADMIN_EMAIL env var is required');
  }

  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  const prisma = new PrismaClient({ log: ['error'] });

  try {
    await prisma.$connect();

    const adminUser = await prisma.adminUser.upsert({
      where: { email },
      create: {
        email,
        name: process.env.BOOTSTRAP_ADMIN_NAME ?? 'System Admin',
        role: 'admin',
        status: 'ACTIVE',
        ...(password ? { passwordHash: await hashPassword(password) } : {})
      },
      update: {
        role: 'admin',
        status: 'ACTIVE',
        ...(password ? { passwordHash: await hashPassword(password) } : {})
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
