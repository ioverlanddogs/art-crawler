# Environment reference

This document explains environment variables used by the Artio monorepo and which runtime needs them.

## Canonical naming + compatibility

- `MINING_IMPORT_SECRET` is the canonical shared secret for mining -> app import auth.
- `MINING_SERVICE_SECRET` remains a deprecated legacy fallback in runtime code only, to avoid breaking older deployments during migration.
- If both are set, `MINING_IMPORT_SECRET` always wins.

## App (`packages/app`)

| Variable | Local example | Required in production | Purpose |
|---|---|---:|---|
| `DATABASE_URL` | `postgresql://.../artio_app?schema=public` | Yes | Main Prisma connection for the app DB |
| `DATABASE_URL_DIRECT` | `postgresql://.../artio_app?schema=public` | Yes | Direct DB connection for migrations/admin tasks |
| `NEXTAUTH_SECRET` | `change-me` | Yes | NextAuth signing secret |
| `NEXTAUTH_URL` | `http://localhost:3000` | Yes | Canonical public app base URL |
| `MINING_IMPORT_SECRET` | `dev-mining-secret` | Yes | Canonical shared secret for worker-to-app imports |
| `NODE_ENV` | `development` | Yes | Runtime mode |

## Mining (`packages/mining`)

| Variable | Local example | Required in production | Purpose |
|---|---|---:|---|
| `MINING_DATABASE_URL` | `postgresql://.../artio_mining?schema=public` | Yes | Main Prisma connection for mining DB |
| `MINING_DATABASE_URL_DIRECT` | `postgresql://.../artio_mining?schema=public` | Yes | Direct DB connection for migrations/admin tasks |
| `PIPELINE_IMPORT_URL` | `http://localhost:3000/api/pipeline/import` | Yes | Import endpoint exposed by the app |
| `MINING_IMPORT_SECRET` | `dev-mining-secret` | Yes | Canonical shared secret for authenticated imports |
| `REDIS_URL` | `redis://localhost:6379` | No (local default) | BullMQ / Redis queue backend |
| `RUN_ONCE` | `true` | No | Useful for one-shot local/demo runs |
| `MINING_HEALTH_PORT` | `7301` | No | Health server port (default `7301`) |
| `NODE_ENV` | `development` | Yes | Runtime mode |

## Test / E2E helper vars

| Variable | Local example | Required | Purpose |
|---|---|---:|---|
| `E2E_BASE_URL` | `http://localhost:3000` | No | Playwright target URL (defaults to localhost) |

## Variables not needed by Vercel

When deploying only the web UI on Vercel, you do **not** need:
- `MINING_DATABASE_URL`
- `MINING_DATABASE_URL_DIRECT`
- `REDIS_URL`

Those belong to the mining service runtime.

## Secret management rules

- Never commit production secrets.
- Use distinct secrets for local, preview, and production.
- Rotate `MINING_IMPORT_SECRET` and `NEXTAUTH_SECRET` if they are exposed.
- Keep app DB credentials separate from mining DB credentials.

## Preview environment guidance

For Vercel preview deployments:
- use a separate preview database if possible
- use a preview-safe `NEXTAUTH_URL`
- avoid letting preview environments receive production mining traffic
- use a preview-only `MINING_IMPORT_SECRET`

## Example production split

### Vercel app

```text
DATABASE_URL=<managed-postgres-pooled-url>
DATABASE_URL_DIRECT=<managed-postgres-direct-url>
NEXTAUTH_SECRET=<strong-random-secret>
NEXTAUTH_URL=https://admin.example.com
MINING_IMPORT_SECRET=<shared-secret>
NODE_ENV=production
```

### Mining worker

```text
MINING_DATABASE_URL=<managed-postgres-pooled-url>
MINING_DATABASE_URL_DIRECT=<managed-postgres-direct-url>
REDIS_URL=<managed-redis-url>
PIPELINE_IMPORT_URL=https://admin.example.com/api/pipeline/import
MINING_IMPORT_SECRET=<same-shared-secret>
NODE_ENV=production
```
