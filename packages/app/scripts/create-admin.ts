import { PrismaClient } from '../generated/prisma/index.js';
import { hashPassword } from '../lib/password.js';

type CliOptions = {
  email?: string;
  name?: string;
  password?: string;
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
    name: readArg('--name') ?? process.env.BOOTSTRAP_ADMIN_NAME,
    password: readArg('--password') ?? process.env.BOOTSTRAP_ADMIN_PASSWORD,
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

async function main() {
  const options = getOptions();

  assertDatabaseEnv();

  if (!options.email) {
    throw new Error(
      'Admin email is required. Pass --email or BOOTSTRAP_ADMIN_EMAIL. This email is provisioned for Google-first admin sign-in (credentials is break-glass only).'
    );
  }

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
      console.log('This admin email is provisioned for Google-first sign-in; credentials is break-glass only.');
      return;
    }

    await prisma.adminUser.create({
      data: {
        email: options.email,
        name: options.name,
        role: 'admin',
        status: 'ACTIVE',
        ...(options.password ? { passwordHash: await hashPassword(options.password) } : {})
      }
    });

    console.log(`Created initial admin user: ${options.email}`);
    console.log('This admin email is provisioned for Google-first sign-in; credentials is break-glass only.');
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
