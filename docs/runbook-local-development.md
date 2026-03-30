# Local development runbook

## Start infrastructure
`docker compose up -d`

## Install and prepare
`npm install`
`npm run prisma:generate -w @artio/app`
`npm run prisma:generate -w @artio/mining`
`npm run prisma:push -w @artio/app`
`# DATABASE_URL is required; if DATABASE_URL_DIRECT is unset, @artio/app prisma:push falls back to DATABASE_URL.`
`npm run prisma:push -w @artio/mining`

## Seed deterministic demo data
`npm run seed:demo`

## Run services
- App: `npm run dev -w @artio/app`
- Mining once: `RUN_ONCE=true npm run dev -w @artio/mining`
- Mining scheduler + health endpoint: `npm run dev -w @artio/mining` (`http://localhost:7301/healthz`)

## Deterministic vertical-slice demo
`npm run demo:vertical-slice`

## Validate
- App health: `curl http://localhost:3000/api/healthz`
- Mining health: `curl http://localhost:7301/healthz`
- Build: `npm run build`
- Tests: `npm run test`
- Lint: `npm run lint`
- E2E smoke: `npm run test:e2e`
