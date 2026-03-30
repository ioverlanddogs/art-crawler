# Deploying the Artio web UI on Vercel

This guide covers the **Next.js admin app only** in `packages/app`.

The mining worker in `packages/mining` is a separate long-running service and should **not** be deployed to Vercel. Deploy it on a worker-friendly platform such as Fly.io, Railway, Render, ECS, or Kubernetes.

## What this deployment includes

Vercel will host:
- the Next.js admin UI
- Next.js API routes in `packages/app/app/api/*`
- the pipeline import endpoint used by the mining service

Vercel will **not** host:
- BullMQ workers
- Redis-backed schedulers
- long-running mining jobs

## Prerequisites

Before creating the Vercel project, make sure you have:
- a GitHub repo containing this monorepo
- a production Postgres database for the app schema
- a production Redis instance for the mining service
- a separate deployment target for `packages/mining`
- a strong shared secret for `MINING_IMPORT_SECRET`
- a strong `NEXTAUTH_SECRET`

## Recommended production topology

- **Vercel**: `packages/app`
- **Managed Postgres**: app database used by Prisma in `packages/app`
- **Worker host**: `packages/mining`
- **Managed Redis**: queue backend for mining workers

The mining service should call the Vercel-hosted import endpoint:

```text
https://<your-domain>/api/pipeline/import
```

## Vercel project settings

Create a Vercel project from the GitHub repo and use these settings:

- **Framework Preset**: Next.js
- **Root Directory**: `packages/app`
- **Install Command**: `npm install`
- **Build Command**: `npm run prisma:generate && npm run build`
- **Output Directory**: `.next`

Because the app uses Prisma, `prisma generate` must run before the Next.js build.

## Required environment variables in Vercel

Add these variables to the Vercel project:

| Variable | Required | Notes |
|---|---:|---|
| `DATABASE_URL` | Yes | App database pooled connection string |
| `DATABASE_URL_DIRECT` | Yes | Direct Postgres connection string for migrations |
| `NEXTAUTH_SECRET` | Yes | Long random secret |
| `NEXTAUTH_URL` | Yes | Public base URL, e.g. `https://admin.example.com` |
| `MINING_IMPORT_SECRET` | Yes | Shared secret also configured in the mining service |
| `NODE_ENV` | Yes | Set to `production` |

The Vercel app does **not** need `MINING_DATABASE_URL`, `MINING_DATABASE_URL_DIRECT`, or `REDIS_URL`.

## Database setup

The app uses Prisma and expects the **app schema only**.

Run these commands from a machine with DB access after the database is created:

```bash
npm install
npm run prisma:generate -w @artio/app
npm run prisma:push -w @artio/app
```

For stricter production change management, replace `prisma db push` with checked-in migrations once the schema stabilizes.

## Auth setup notes

The current MVP auth flow uses NextAuth with a credentials provider and JWT session strategy.

Before production launch, make sure you:
- create at least one admin user in the app database
- set a strong `NEXTAUTH_SECRET`
- set `NEXTAUTH_URL` to the final HTTPS URL
- review the current credentials flow and harden it before exposing the app publicly

## Mining service configuration

Your mining deployment should use values like:

```text
PIPELINE_IMPORT_URL=https://<your-domain>/api/pipeline/import
MINING_IMPORT_SECRET=<same-secret-as-vercel>
```

That keeps the required boundary intact: mining writes to the app only through the import API.

## Deploy sequence

Recommended order:

1. Provision the production app database.
2. Configure all Vercel environment variables.
3. Run Prisma generate/push for `@artio/app`.
4. Deploy the Vercel project.
5. Verify the admin UI loads.
6. Create or seed an admin user.
7. Deploy the mining worker elsewhere.
8. Point mining to the Vercel import endpoint.
9. Verify that a batch reaches moderation.

## Post-deploy verification

After the first deploy, verify:
- the site loads over HTTPS
- auth works for an admin user
- `/api/admin/moderation/queue` returns a valid response for an authenticated admin
- `POST /api/pipeline/import` accepts a valid worker request with the shared secret
- `mining_import_enabled` is present and set correctly in config
- moderation pages render expected data

## Common pitfalls

### 1. Wrong root directory
If Vercel builds the repo root instead of `packages/app`, the deployment will fail or build the wrong target.

### 2. Prisma client not generated
If the build does not run `prisma generate`, the app can fail at runtime.

### 3. Missing direct DB URL
Even if the app mostly uses `DATABASE_URL`, operational workflows often still need `DATABASE_URL_DIRECT`.

### 4. Mining deployed to Vercel
Do not deploy BullMQ workers or schedulers to Vercel. They need a persistent worker platform.

### 5. Shared secret mismatch
If `MINING_IMPORT_SECRET` differs between app and mining, imports will fail.

## Suggested production domains

Use a dedicated admin host, for example:
- `admin.example.com` for the Vercel app
- `worker.example.com` or an internal worker platform for mining

This keeps admin routing and worker infrastructure clearly separated.
