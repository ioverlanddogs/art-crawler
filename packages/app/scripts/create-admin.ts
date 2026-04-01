import bcrypt from 'bcryptjs';
import { PrismaClient } from '../generated/prisma/index.js';

type CliOptions = {
  email?: string;
  password?: string;
  name?: string;
  dryRun: boolean;
};

function readArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

function getOptions(): CliOptions {
  return {
    email: readArg('--email') ?? process.env.BOOTSTRAP_ADMIN_EMAIL,
    password: readArg('--password') ?? process.env.BOOTSTRAP_ADMIN_PASSWORD,
    name: readArg('--name') ?? process.env.BOOTSTRAP_ADMIN_NAME,
    dryRun: process.argv.includes('--dry-run')
  };
}

function assertDatabaseEnv() {
  const missing = ['DATABASE_URL', 'DATABASE_URL_DIRECT'].filter((key) => {
    const value = process.env[key];
    return !value || value.trim().length === 0;
  });

  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  }
}

function validatePassword(password: string) {
  if (password.length < 12) {
    throw new Error('Admin password must be at least 12 characters.');
  }
}

async function main() {
  const options = getOptions();

  assertDatabaseEnv();

  if (!options.email) {
    throw new Error('Admin email is required. Pass --email or BOOTSTRAP_ADMIN_EMAIL.');
  }

  if (!options.password) {
    throw new Error('Admin password is required. Pass --password or BOOTSTRAP_ADMIN_PASSWORD.');
  }

  validatePassword(options.password);

  const prisma = new PrismaClient({ log: ['error'] });

  try {
    await prisma.$connect();

    const existingAdmin = await prisma.adminUser.findFirst({
      where: {
        role: 'admin',
        status: 'ACTIVE'
      },
      select: { id: true, email: true }
    });

    if (existingAdmin) {
      console.log(`Skipping admin creation. Active admin already exists (${existingAdmin.email}).`);
      return;
    }

    const existingByEmail = await prisma.adminUser.findUnique({
      where: { email: options.email },
      select: { id: true, status: true, role: true }
    });

    if (existingByEmail) {
      console.log(`Skipping admin creation. User already exists with email ${options.email}.`);
      return;
    }

    if (options.dryRun) {
      console.log('Dry run complete: no active admin exists and a new admin would be created.');
      return;
    }

    const passwordHash = await bcrypt.hash(options.password, 12);

    await prisma.adminUser.create({
      data: {
        email: options.email,
        name: options.name,
        passwordHash,
        role: 'admin',
        status: 'ACTIVE'
      }
    });

    console.log(`Created initial admin user: ${options.email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    console.log('create-admin finished successfully.');
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`create-admin failed: ${message}`);
    process.exitCode = 1;
  });
