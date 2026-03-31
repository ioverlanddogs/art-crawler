# Artio Monorepo MVP

## What is implemented
- Next.js admin app in `packages/app`.
- Mining worker service in `packages/mining`.
- Prisma schemas for app and mining stores.
- Import API boundary (`POST /api/pipeline/import`) for all mining-to-app writes.

## Clean-environment setup
```bash
cp .env.example .env
npm run setup:local
```

`setup:local` performs:
1. Starts docker dependencies.
2. Installs npm workspaces.
3. Runs Prisma generate/push for app and mining.
4. Seeds `mining_import_enabled=true` for moderation visibility.

## Manual setup (equivalent)
```bash
cp .env.example .env
docker compose up -d
npm install
npm run prisma:push -w @artio/app
npm run prisma:push -w @artio/mining
npm run seed:demo
```

## Run services locally
```bash
# app server
npm run dev -w @artio/app

# mining scheduler + health endpoint on :7301/healthz
npm run dev -w @artio/mining
```

## Deterministic vertical-slice demo
```bash
# terminal 1
npm run dev -w @artio/app

# terminal 2
npm run demo:vertical-slice
```

Then verify:
- `GET /api/admin/moderation/queue`
- `GET /api/healthz`
- `GET http://localhost:7301/healthz`
- Open `http://localhost:3000/moderation`

## Validation commands
```bash
npm run build
npm run test
npm run lint
npm run test:e2e
```

## Playwright smoke test setup (headless)
Playwright runs headless by default.

```bash
# one-time browser install
npx playwright install --with-deps chromium

# run app server in one terminal, then run smoke tests
npm run dev -w @artio/app
npm run test:e2e
```

## Current scope notes
- Test coverage is focused on MVP critical paths (unit + integration + smoke e2e).
- Local development assumes Docker availability for Postgres/Redis.
- Mining-to-app writes remain constrained to the import API boundary.
