#!/usr/bin/env node
import { execSync } from 'node:child_process';

const MAX_ATTEMPTS = 30;
const WAIT_MS = 2000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function check(command) {
  execSync(command, { stdio: 'ignore' });
}

async function waitFor(name, command) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      check(command);
      console.log(`${name} is ready (${attempt}/${MAX_ATTEMPTS}).`);
      return;
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(`${name} did not become ready in time. Last error: ${error.message}`);
      }

      console.log(`Waiting for ${name} (${attempt}/${MAX_ATTEMPTS})...`);
      await sleep(WAIT_MS);
    }
  }
}

async function main() {
  await waitFor('Postgres', 'docker compose exec -T postgres pg_isready -U postgres');
  await waitFor('Redis', 'docker compose exec -T redis redis-cli ping');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
