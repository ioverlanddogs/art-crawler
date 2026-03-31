#!/usr/bin/env node
import { execSync } from 'node:child_process';

const DATABASE_URL_ENV_KEYS = ['DATABASE_URL', 'MINING_DATABASE_URL'];

function run(command) {
  return execSync(command, { encoding: 'utf8' }).trim();
}

function getDatabaseNameFromEnv(envKey) {
  const databaseUrl = process.env[envKey];
  if (!databaseUrl) {
    throw new Error(`${envKey} is required to bootstrap databases.`);
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error(`${envKey} is not a valid URL.`);
  }

  const dbPath = parsedUrl.pathname.replace(/^\/+/, '');
  const databaseName = decodeURIComponent(dbPath);

  if (!databaseName) {
    throw new Error(`${envKey} must include a database name in the URL path.`);
  }

  if (databaseName.includes('/')) {
    throw new Error(`${envKey} contains an invalid database name: ${databaseName}`);
  }

  return databaseName;
}

function getTargetDatabases() {
  return DATABASE_URL_ENV_KEYS.map(getDatabaseNameFromEnv);
}

function databaseExists(databaseName) {
  const sql = `SELECT 1 FROM pg_database WHERE datname = '${databaseName}'`;
  const output = run(`docker compose exec -T postgres psql -U postgres -d postgres -tAc \"${sql}\"`);
  return output === '1';
}

function createDatabase(databaseName) {
  run(`docker compose exec -T postgres psql -U postgres -d postgres -c \"CREATE DATABASE ${databaseName};\"`);
}

function ensureDatabase(databaseName) {
  if (databaseExists(databaseName)) {
    console.log(`Database ${databaseName} already exists.`);
    return;
  }

  console.log(`Creating database ${databaseName}...`);
  createDatabase(databaseName);
  console.log(`Database ${databaseName} created.`);
}

function main() {
  getTargetDatabases().forEach(ensureDatabase);
}

try {
  main();
} catch (error) {
  console.error('Failed to bootstrap databases.');
  console.error(error.message);
  process.exitCode = 1;
}
