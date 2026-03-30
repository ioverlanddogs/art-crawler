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
npm run prisma:generate -w @artio/app
npm run prisma:generate -w @artio/mining
npm run prisma:push -w @artio/app
npm run prisma:push -w @artio/mining
npm run seed:demo
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
- Open `http://localhost:3000/moderation`

## Validation commands
```bash
npm run build
npm run test
npm run test:e2e
```

## Deferred / clearly out-of-scope in this MVP
- Full admin moderation UX (bulk actions, duplicate cluster UX).
- Full auth hardening and invite acceptance completion UX.
- Production-grade mining scheduler orchestration and observability dashboards.
- Complete Layer 1–8 endpoint and screen coverage from the full spec bundle.

## Known limitations
- This repo assumes local Docker availability for Postgres/Redis.
- Test coverage is focused on one vertical slice and smoke-path behavior.
- E2E tests expect a running local app server and seeded DB state.
- Some spec-listed endpoints remain intentionally deferred (see section above).
