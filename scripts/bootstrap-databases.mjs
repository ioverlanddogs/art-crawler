#!/usr/bin/env node
import { execSync } from 'node:child_process';

const DATABASES = ['artio_app', 'artio_mining'];

function run(command) {
  return execSync(command, { encoding: 'utf8' }).trim();
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
  DATABASES.forEach(ensureDatabase);
}

try {
  main();
} catch (error) {
  console.error('Failed to bootstrap databases.');
  console.error(error.message);
  process.exitCode = 1;
}
