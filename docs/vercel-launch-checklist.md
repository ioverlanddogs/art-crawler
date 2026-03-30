# Vercel launch checklist

Use this checklist before declaring the web UI production-ready.

## GitHub and Vercel

- [ ] GitHub repo is up to date and the default branch is correct.
- [ ] Vercel project points to `packages/app` as the root directory.
- [ ] Build command is set to `npm run prisma:generate && npm run build`.
- [ ] Preview and production environments are separated correctly.

## Environment variables

- [ ] `DATABASE_URL` is set.
- [ ] `DATABASE_URL_DIRECT` is set.
- [ ] `NEXTAUTH_SECRET` is set to a strong random value.
- [ ] `NEXTAUTH_URL` matches the public HTTPS domain.
- [ ] `MINING_IMPORT_SECRET` is set.
- [ ] Production secrets are not reused in preview.

## Database

- [ ] Production Postgres database exists.
- [ ] Prisma client generation works for `@artio/app`.
- [ ] The app schema has been pushed or migrated successfully.
- [ ] At least one admin user exists.
- [ ] The active config row includes `mining_import_enabled`.

## Web UI

- [ ] Home page or admin entry loads successfully.
- [ ] Sign-in works.
- [ ] Middleware protects admin routes.
- [ ] Dashboard renders without server errors.
- [ ] Moderation queue page loads.
- [ ] Config pages load.
- [ ] Pipeline status pages load.

## Import boundary

- [ ] A test request to `POST /api/pipeline/import` succeeds with the correct bearer secret.
- [ ] An invalid secret is rejected.
- [ ] A valid batch becomes visible only when `mining_import_enabled=true`.
- [ ] Deduplication behavior is verified on repeat imports.

## Observability and operations

- [ ] Vercel logs are enabled and accessible.
- [ ] Database monitoring is enabled.
- [ ] Mining worker logs are accessible separately.
- [ ] There is a documented rollback plan.
- [ ] There is a documented admin-user recovery path.

## Security and hardening

- [ ] `NEXTAUTH_SECRET` is not a placeholder.
- [ ] Public deployment uses HTTPS only.
- [ ] No development credentials remain in production.
- [ ] Preview deployments do not have production import secrets.
- [ ] Credentials-provider auth flow has been reviewed before public exposure.

## Final release check

- [ ] A full deploy from GitHub to Vercel completes successfully.
- [ ] A seeded or real candidate appears in the moderation queue.
- [ ] One approve or reject action succeeds.
- [ ] Known limitations are documented in the README.
