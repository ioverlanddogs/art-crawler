# Local development runbook

## Start infrastructure
`docker compose up -d`

## Install and prepare
`npm install`
`npm run prisma:generate -w @artio/app`
`npm run prisma:generate -w @artio/mining`
`npm run prisma:push -w @artio/app`
`npm run prisma:push -w @artio/mining`

## Seed deterministic demo data
`npm run seed:demo`

## Run services
- App: `npm run dev -w @artio/app`
- Mining once: `RUN_ONCE=true npm run dev -w @artio/mining`
- Mining scheduler: `npm run dev -w @artio/mining`

## Deterministic vertical-slice demo
`npm run demo:vertical-slice`
