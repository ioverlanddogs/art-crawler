# Production DB bootstrap (Vercel + Neon)

This runbook bootstraps the **application database** for `@artio/app` in a production-safe way.

## Required environment variables

Set these in Vercel (or your shell when running locally against Neon):

- `DATABASE_URL` (pooled Neon connection string)
- `DATABASE_URL_DIRECT` (direct Neon connection string for Prisma migrations)
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`

Optional admin bootstrap inputs:

- `BOOTSTRAP_ADMIN_EMAIL`
- `BOOTSTRAP_ADMIN_PASSWORD`
- `BOOTSTRAP_ADMIN_NAME`

## Safe command order

From repo root:

```bash
npm ci
npm run prisma:generate -w @artio/app
npm run bootstrap:prod-db -w @artio/app -- --admin-email "admin@example.com" --admin-password "<strong-password>" --admin-name "Initial Admin"
```

### What bootstrap does

1. Verifies required DB env vars are present.
2. Runs `prisma migrate status`.
3. Runs `prisma migrate deploy` (production-safe migration path).
4. Creates an initial `AdminUser` only if there is no existing ACTIVE `admin` user.

## Monorepo install + lockfile expectations

- This repository uses **npm workspaces** from the repo root (`package.json` at `/`).
- Commit and maintain a **root `package-lock.json`** so CI can run reproducible installs.
- DB GitHub workflows run dependency installation from the repo root with `npm ci`, then execute app Prisma commands via `-w @artio/app`.

## GitHub Actions workflows (production)

Use the GitHub **production environment** for DB workflows and add these environment secrets:

- `DATABASE_URL`
- `DATABASE_URL_DIRECT`
- `BOOTSTRAP_ADMIN_EMAIL`
- `BOOTSTRAP_ADMIN_PASSWORD`
- `BOOTSTRAP_ADMIN_NAME`

### 1) One-time bootstrap: `db-bootstrap`

- Workflow file: `.github/workflows/db-bootstrap.yml`
- Trigger: manual (`workflow_dispatch`)
- Use this for first-time production DB initialization (or any controlled rerun).
- It installs workspace dependencies from repo root (`npm ci`), generates Prisma client for `@artio/app`, then runs bootstrap (`prisma migrate deploy` + idempotent admin creation).
- Admin identity can come from workflow inputs or production environment secrets.

### 2) Ongoing migrations: `db-migrate`

- Workflow file: `.github/workflows/db-migrate.yml`
- Trigger: `push` to `main` when app Prisma schema/migrations-related files change.
- It is intentionally narrow: installs workspace dependencies from repo root (`npm ci`), generates Prisma client, and runs `prisma migrate deploy` only.
- It does **not** create or modify admin users.

### 3) Manual operator check: `db-status`

- Workflow file: `.github/workflows/db-status.yml`
- Trigger: manual (`workflow_dispatch`)
- Runs `prisma migrate status` in production context for before/after checks.

## Dry run / status checks

Check migration status and admin-creation preconditions without writing:

```bash
npm run bootstrap:prod-db -w @artio/app -- --dry-run --admin-email "admin@example.com" --admin-password "<strong-password>"
```

Run admin creation logic only:

```bash
npm run create:admin -w @artio/app -- --email "admin@example.com" --password "<strong-password>" --name "Initial Admin"
```

## Verification

- Verify migrations are applied:

```bash
npm run prisma:migrate:status -w @artio/app
```

- Verify `AdminUser` exists and is login-ready (`role=admin`, `status=ACTIVE`) by checking via SQL client/Prisma Studio.
- In GitHub Actions, verify `db-bootstrap`/`db-migrate`/`db-status` job completion in the **production** environment.

## Vercel deployment note

Vercel applies new environment variables only to **new deployments**. After adding or changing DB/auth env vars, trigger a redeploy before validating login.
