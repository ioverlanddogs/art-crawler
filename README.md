# Artio Monorepo MVP

This repository is now a runnable npm-workspace monorepo with:
- Next.js admin app in `packages/app`
- Mining worker service in `packages/mining`
- Prisma schemas for both app and mining databases
- BullMQ-shaped mining pipeline with an end-to-end vertical slice
- Import API boundary (`POST /api/pipeline/import`) for cross-service writes

## Quick start
1. `cp .env.example .env`
2. `docker compose up -d`
3. `npm install`
4. `npm run prisma:generate -w @artio/app && npm run prisma:generate -w @artio/mining`
5. `npm run prisma:push -w @artio/app && npm run prisma:push -w @artio/mining`
6. `npm run dev`

## Demo vertical slice
1. Start app: `npm run dev -w @artio/app`
2. Run mining once: `RUN_ONCE=true npm run dev -w @artio/mining`
3. Check moderation queue: `GET /api/admin/moderation/queue`

## Commands
- `npm run dev`
- `npm run build`
- `npm run test`
- `npm run lint`

## Architecture highlights
- Mining never writes to app DB directly. It exports by HTTP import API only.
- Import API uses Zod validation before writes.
- Candidate insertion enforces fingerprint dedup.
- Telemetry rows emitted in each mining stage and import stage.

See docs:
- `docs/implementation-assumptions.md`
- `docs/mvp-scope.md`
- `docs/runbook-local-development.md`
