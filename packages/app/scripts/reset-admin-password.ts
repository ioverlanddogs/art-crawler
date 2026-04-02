/**
 * Force-updates the passwordHash on an existing AdminUser row.
 * Use this when the bootstrap upsert did not write a password (legacy rows).
 *
 * Usage:
 *   BOOTSTRAP_ADMIN_EMAIL=you@example.com \
 *   BOOTSTRAP_ADMIN_PASSWORD=yourpassword \
 *   npm run reset:admin-password -w @artio/app
 */
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
  if (!email) throw new Error('BOOTSTRAP_ADMIN_EMAIL is required');

  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!password) throw new Error('BOOTSTRAP_ADMIN_PASSWORD is required');

  const prisma = new PrismaClient({ log: ['error'] });

  try {
    await prisma.$connect();

    const existing = await prisma.adminUser.findUnique({
      where: { email },
      select: { id: true, email: true, status: true }
    });

    if (!existing) {
      throw new Error(`No AdminUser found with email: ${email}`);
    }

    const passwordHash = await hashPassword(password);

    await prisma.adminUser.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        status: 'ACTIVE',
        role: 'admin'
      }
    });

    console.log(`Password updated for: ${existing.email}`);
    console.log('Status confirmed: ACTIVE');
    console.log(`Hash prefix: ${passwordHash.slice(0, 7)}`);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => console.log('reset-admin-password finished successfully.'))
  .catch((error: unknown) => {
    console.error(`reset-admin-password failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exitCode = 1;
  });
