# Local development runbook

## Start infrastructure
`docker compose up -d`

## Install and prepare
`npm install`
`npm run prisma:generate -w @artio/app`
`npm run prisma:generate -w @artio/mining`
`npm run prisma:push -w @artio/app`
`npm run prisma:push -w @artio/mining`

## Seed toggle for moderation visibility
`psql postgresql://postgres:postgres@localhost:5432/artio_app -c "insert into \"SiteSetting\"(key,value,\"updatedAt\") values ('mining_import_enabled','true',now()) on conflict (key) do update set value='true';"`

## Run services
- App: `npm run dev -w @artio/app`
- Mining once: `RUN_ONCE=true npm run dev -w @artio/mining`
- Mining scheduler: `npm run dev -w @artio/mining`
