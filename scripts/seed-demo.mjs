#!/usr/bin/env node
import { execSync } from 'node:child_process';

function run(cmd) {
  execSync(cmd, { stdio: 'inherit' });
}

run(`docker compose exec -T postgres psql -U postgres -c "CREATE DATABASE artio_app;" || true`);
run(`docker compose exec -T postgres psql -U postgres -c "CREATE DATABASE artio_mining;" || true`);
run(
  `docker compose exec -T postgres psql -U postgres -d artio_app -c "insert into \\"SiteSetting\\"(key,value,\\"updatedAt\\") values ('mining_import_enabled','true',now()) on conflict (key) do update set value='true';"`
);

console.log('Seed complete: mining_import_enabled=true');
