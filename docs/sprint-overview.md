# Data Master Centre — Sprint overview

Six sprints. Each is self-contained and ends with a passing test suite. No sprint requires anything from a later sprint.

---

## Dependency chain

```
Sprint 1 (Schema)
    └── Sprint 2 (Intake API)
            └── Sprint 3 (Intake UI)
                    └── Sprint 4 (Review workbench)
                            └── Sprint 5 (AI extraction + Publish queue)
                                    └── Sprint 6 (Audit, versioning, polish)
```

Each sprint's acceptance criteria includes `npm run typecheck && npm run test` passing. Do not start a sprint until the previous one passes.

---

## What each sprint delivers

| Sprint | Deliverable | New files (approx) |
|--------|-------------|-------------------|
| 1 | 6 new Prisma models, 4 enums, `Event.publishStatus` | schema only |
| 2 | Intake service layer, 3 API routes, unit tests | ~8 lib files, ~3 routes, ~2 test files |
| 3 | Intake form, job list page, job detail page, dashboard stats | ~5 components, ~2 pages, ~1 test file |
| 4 | Three-pane workbench, field review routes, approve/merge route | ~4 components, ~4 routes, ~2 test files |
| 5 | Real AI extraction, publish queue page and routes, data health widgets | ~2 lib files, ~3 routes, ~1 page, ~2 test files |
| 6 | Version snapshots, rollback, audit trail, unified review queue | ~1 schema addition, ~4 routes, ~2 pages, ~2 test files |

---

## Scope boundaries

**In scope across all sprints:**
- `packages/app` only. The mining service (`packages/mining`) is not modified.
- App Prisma schema additions only — no mining schema changes.
- Admin UI only — no public-facing routes.
- All new routes follow existing auth patterns (`requireRole` from `@/lib/auth-guard`).
- All new components use the existing component library in `packages/app/components/admin/`.

**Explicitly deferred (not in any sprint):**
- `CanonicalRecord` abstraction layer — `Event` is the canonical layer for now.
- Cross-source corroboration.
- Batch URL imports.
- Model routing by source type.
- Full multi-tenant scope controls.
- Deep analytics visualisations.

---

## Constraints that apply to every sprint

1. Run `npm run typecheck -w @artio/app && npm run test -w @artio/app` before marking done. Both must exit 0.
2. Do not modify `packages/mining`. Do not modify the existing import pipeline routes under `packages/app/app/api/pipeline/`.
3. Do not modify the existing moderation routes or `ModerationClient.tsx` except where a sprint explicitly instructs it.
4. Follow the existing mock pattern in `packages/app/tests/admin-api-authz-regressions.test.ts` for all new route tests — mock `@/lib/db` and `@/lib/auth-guard`, never connect to a real database in unit tests.
5. Do not use an HTML `<form>` tag in any React component — use `onClick` handlers. This is an existing repo convention.
6. All new API routes must enforce role-based auth. Check the role requirement table: viewer/moderator = read-only; operator = read + approve + merge + publish; admin = all including rollback and config.
7. `npm run prisma:push` uses `db push` (not migrations). Do not create migration files.
8. New env vars must be added to `packages/app/.env.example` in the sprint that introduces them.

---

## Role permission summary for new routes

| Route | viewer | moderator | operator | admin |
|-------|--------|-----------|----------|-------|
| GET intake list/detail | ✓ | ✓ | ✓ | ✓ |
| POST intake submit | — | — | ✓ | ✓ |
| GET workbench fields | ✓ | ✓ | ✓ | ✓ |
| PATCH field decision | — | — | ✓ | ✓ |
| POST workbench approve | — | — | ✓ | ✓ |
| POST workbench reject | — | — | ✓ | ✓ |
| GET publish queue | ✓ | ✓ | ✓ | ✓ |
| POST publish event | — | — | ✓ | ✓ |
| POST rollback | — | — | — | ✓ |
| GET audit | ✓ | ✓ | ✓ | ✓ |
