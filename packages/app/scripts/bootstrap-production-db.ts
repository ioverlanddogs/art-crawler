import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

function getFlagValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
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

function run(command: string, args: string[], extraEnv?: NodeJS.ProcessEnv) {
  const completed = spawnSync(command, args, {
    stdio: 'inherit',
    env: {
      ...process.env,
      ...extraEnv
    }
  });

  if (completed.status !== 0) {
    throw new Error(`Command failed (${command} ${args.join(' ')})`);
  }
}

function runWithCapturedOutput(command: string, args: string[]) {
  const completed = spawnSync(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
    encoding: 'utf-8'
  });

  return completed;
}

async function main() {
  assertDatabaseEnv();

  const adminEmail = getFlagValue('--admin-email') ?? process.env.BOOTSTRAP_ADMIN_EMAIL;
  const adminPassword = getFlagValue('--admin-password') ?? process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const adminName = getFlagValue('--admin-name') ?? process.env.BOOTSTRAP_ADMIN_NAME;
  const dryRun = hasFlag('--dry-run');
  const skipAdmin = hasFlag('--skip-admin');

  const scriptPath = resolve(process.cwd(), 'scripts/create-admin.ts');

  console.log('1/3 Checking Prisma migration status...');
  const status = runWithCapturedOutput('npx', ['prisma', 'migrate', 'status', '--schema', 'prisma/schema.prisma']);
  if (status.status !== 0) {
    process.stdout.write(status.stdout ?? '');
    process.stderr.write(status.stderr ?? '');
    throw new Error('Unable to determine migration status.');
  }
  process.stdout.write(status.stdout ?? '');

  if (!dryRun) {
    console.log('2/3 Applying pending migrations with prisma migrate deploy...');
    run('npx', ['prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma']);
  } else {
    console.log('2/3 Dry run enabled, skipping prisma migrate deploy.');
  }

  if (skipAdmin) {
    console.log('3/3 Skipping admin creation because --skip-admin was provided.');
  } else if (!adminEmail || !adminPassword) {
    console.log('3/3 Skipping admin creation (admin credentials not provided).');
  } else {
    const createAdminArgs = ['--import', 'tsx', scriptPath, '--email', adminEmail, '--password', adminPassword];

    if (adminName) {
      createAdminArgs.push('--name', adminName);
    }

    if (dryRun) {
      createAdminArgs.push('--dry-run');
    }

    console.log('3/3 Ensuring initial ACTIVE admin user exists...');
    run('node', createAdminArgs);
  }

  console.log('Bootstrap completed successfully.');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(`Bootstrap failed: ${message}`);
  process.exitCode = 1;
});
