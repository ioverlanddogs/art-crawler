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
npm install
npm run prisma:generate -w @artio/app
npm run bootstrap:prod-db -w @artio/app -- --admin-email "admin@example.com" --admin-password "<strong-password>" --admin-name "Initial Admin"
```

### What bootstrap does

1. Verifies required DB env vars are present.
2. Runs `prisma migrate status`.
3. Runs `prisma migrate deploy` (production-safe migration path).
4. Creates an initial `AdminUser` only if there is no existing ACTIVE `admin` user.

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

## Vercel deployment note

Vercel applies new environment variables only to **new deployments**. After adding or changing DB/auth env vars, trigger a redeploy before validating login.
