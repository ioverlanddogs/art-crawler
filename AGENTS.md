# AGENTS.md — Artio Pipeline Redesign

This file is read by Codex and other AI coding agents before starting work.
It defines the repository structure, task list, constraints, and document index.

---

## Repository structure

This is a **monorepo** managed with npm workspaces.

```
artio/                          ← repo root
├── AGENTS.md                   ← this file
├── package.json                ← workspace root (no code, just workspaces config)
├── packages/
│   ├── app/                    ← Artio Next.js application (existing, extend this)
│   │   ├── app/                ← Next.js App Router
│   │   │   ├── (admin)/        ← Admin UI route group
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── dashboard/
│   │   │   │   ├── moderation/
│   │   │   │   ├── pipeline/
│   │   │   │   ├── data/
│   │   │   │   ├── discovery/
│   │   │   │   ├── config/
│   │   │   │   └── system/
│   │   │   └── api/
│   │   │       ├── admin/      ← All /api/admin/* routes (see M4)
│   │   │       └── pipeline/   ← /api/pipeline/import (see Layer 8)
│   │   ├── lib/
│   │   │   ├── auth.ts         ← NextAuth authOptions (see M2)
│   │   │   ├── auth-guard.ts   ← requireRole() helper (see M2)
│   │   │   ├── db.ts           ← Prisma client singleton
│   │   │   └── ingest/         ← Legacy ingest code (keep but do not extend)
│   │   ├── prisma/
│   │   │   └── schema.prisma   ← All Artio DB models (see M3 + supplement-core-tables)
│   │   ├── middleware.ts        ← NextAuth route protection (see M2)
│   │   └── types/
│   │       └── next-auth.d.ts  ← Session type augmentation (see M2)
│   └── mining/                 ← Standalone Mining Service (build from scratch)
│       ├── Dockerfile
│       ├── fly.toml            ← See M1
│       ├── package.json
│       ├── src/
│       │   ├── index.ts        ← Entry point: starts BullMQ workers + scheduler
│       │   ├── queues.ts       ← Queue definitions (see Layer 1)
│       │   ├── workers/        ← One file per pipeline stage
│       │   │   ├── discovery.ts
│       │   │   ├── fetch.ts
│       │   │   ├── extract.ts
│       │   │   ├── normalise.ts  ← See supplement-normalise-stage
│       │   │   ├── score.ts
│       │   │   ├── deduplicate.ts
│       │   │   ├── enrich.ts
│       │   │   ├── mature.ts
│       │   │   └── export.ts
│       │   ├── lib/
│       │   │   ├── db.ts       ← Prisma client for mining DB
│       │   │   ├── config.ts   ← PipelineConfig loader (see Layer 2)
│       │   │   ├── signals.ts  ← Tier 1 signal vector computation (see Layer 4)
│       │   │   ├── model.ts    ← Tier 2 logistic regression loader + inference (see Layer 4)
│       │   │   ├── dedup.ts    ← Pass 1 + Pass 2 deduplication (see Layer 5)
│       │   │   ├── bandit.ts   ← Thompson sampling (see Layer 7)
│       │   │   ├── enrich/     ← One file per enrichment template (see M5)
│       │   │   └── export.ts   ← Import API client (see Layer 8)
│       │   ├── training/       ← Python model training (see M6)
│       │   │   ├── train.py
│       │   │   ├── labels.py
│       │   │   └── requirements.txt
│       │   └── scheduler.ts    ← APScheduler-equivalent: node-cron jobs
│       ├── prisma/
│       │   └── schema.prisma   ← Mining DB schema (see Layer 3)
│       └── test/
│           ├── unit/
│           └── integration/
├── docs/                       ← All specification documents
│   ├── layer1-pipeline-engine.docx
│   ├── layer2-configuration-store.docx
│   ├── layer3-entity-store.docx
│   ├── layer4-confidence-model.docx
│   ├── layer5-deduplication.docx
│   ├── layer6-observability.docx
│   ├── layer7-discovery.docx
│   ├── layer8-import-api.docx
│   ├── admin-ui-specification.docx
│   ├── ingest-system-spec.docx
│   ├── m1-infrastructure-spec.docx
│   ├── m2-auth-user-management.docx
│   ├── m3-database-schema.docx
│   ├── m4-api-endpoint-map.docx
│   ├── m5-enrichment-layer.docx
│   ├── m6-model-training-ops.docx
│   ├── m7-testing-strategy.docx
│   ├── m8-maturity-enrichment-criteria.docx
│   ├── m9-rollout-operations.docx
│   ├── supplement-normalise-stage.docx
│   └── supplement-core-tables-ddl.docx
└── .github/
    └── workflows/
        ├── ci.yml
        ├── deploy-app-staging.yml
        ├── deploy-app-production.yml
        ├── deploy-mining-staging.yml
        ├── deploy-mining-production.yml
        ├── migrate-app.yml
        └── migrate-mining.yml
```

---

## Build task list

Work through these in order. Each task has a primary spec document.

### Phase 1 — Database & Auth (unblock everything else)

| # | Task | Primary spec | Done? |
|---|------|-------------|-------|
| 1 | Write `packages/app/prisma/schema.prisma` — all core tables + pipeline integration tables | supplement-core-tables-ddl, M3 | ☐ |
| 2 | Write `packages/mining/prisma/schema.prisma` — mining DB (entity store) | Layer 3 | ☐ |
| 3 | Implement `lib/auth.ts` — NextAuth authOptions with database session strategy | M2 | ☐ |
| 4 | Implement `lib/auth-guard.ts` — requireRole() helper used by all API routes | M2 | ☐ |
| 5 | Implement `middleware.ts` — route protection for /admin/* | M2 | ☐ |
| 6 | Implement invite flow — POST /api/admin/users/invite + accept-invite page | M2, M4 | ☐ |

### Phase 2 — Mining Service Core

| # | Task | Primary spec | Done? |
|---|------|-------------|-------|
| 7 | Scaffold `packages/mining/src/queues.ts` — all 9 BullMQ queue definitions | Layer 1 | ☐ |
| 8 | Implement `lib/config.ts` — PipelineConfig loader with 10-min cache | Layer 2 | ☐ |
| 9 | Implement `workers/fetch.ts` — HTML download, SSRF guard, platform detection | Layer 1, ingest-system-spec §3.1–3.3 | ☐ |
| 10 | Implement `workers/extract.ts` — JSON-LD fast path + AI provider abstraction | ingest-system-spec §3.4–3.5 | ☐ |
| 11 | Implement `workers/normalise.ts` — all field normalisation rules | supplement-normalise-stage | ☐ |
| 12 | Implement `lib/signals.ts` — full Tier 1 signal vector (all signals in Layer 4 table) | Layer 4 | ☐ |
| 13 | Implement `lib/model.ts` — logistic regression loader, inference, fallback | Layer 4, M6 | ☐ |
| 14 | Implement `workers/score.ts` — calls signals + model, writes ConfidenceHistory | Layer 4 | ☐ |
| 15 | Implement `lib/dedup.ts` — Pass 1 fingerprint + Pass 2 embedding | Layer 5 | ☐ |
| 16 | Implement `workers/deduplicate.ts` — calls dedup lib, updates candidate status | Layer 5 | ☐ |

### Phase 3 — Enrichment, Maturity & Export

| # | Task | Primary spec | Done? |
|---|------|-------------|-------|
| 17 | Implement all enrichment templates in `lib/enrich/` | M5 | ☐ |
| 18 | Implement `workers/enrich.ts` — priority queue, gate check, template sequencing | M5, M8 | ☐ |
| 19 | Implement `workers/mature.ts` — all 6 maturity criteria, daily job | M8 | ☐ |
| 20 | Implement `lib/export.ts` — Artio import API client with retry | Layer 8 | ☐ |
| 21 | Implement `workers/export.ts` — batch assembly, ExportBatch record | M8, Layer 8 | ☐ |
| 22 | Implement feedback polling — POST /api/pipeline/import/:id/feedback + label writing | Layer 8, M6 | ☐ |

### Phase 4 — Discovery

| # | Task | Primary spec | Done? |
|---|------|-------------|-------|
| 23 | Implement `lib/bandit.ts` — Thompson sampling, exploration budget, update rule | Layer 7 | ☐ |
| 24 | Implement `workers/discovery.ts` — search provider, JS detection, venue seeding | Layer 7 | ☐ |
| 25 | Implement discovery template CRUD + AI suggestion review in admin API | M4, Layer 7 | ☐ |

### Phase 5 — Artio App: Import API & Moderation

| # | Task | Primary spec | Done? |
|---|------|-------------|-------|
| 26 | Implement POST /api/pipeline/import — bearer auth, Zod validation, fingerprint dedup | Layer 8 | ☐ |
| 27 | Implement GET /api/pipeline/import/:id and feedback POST endpoint | Layer 8 | ☐ |
| 28 | Implement all moderation API routes (approve, reject, bulk, duplicates) | M4 | ☐ |
| 29 | Implement pipeline config API routes (CRUD, diff, activate, rollback) | M4, Layer 2 | ☐ |
| 30 | Implement model version API routes (list, detail, promote) | M4, Layer 4 | ☐ |

### Phase 6 — Admin UI

| # | Task | Primary spec | Done? |
|---|------|-------------|-------|
| 31 | Dashboard screen | admin-ui-specification §4 | ☐ |
| 32 | Candidate Queue screen (with mining badge, cluster view) | admin-ui-specification §5 | ☐ |
| 33 | Pipeline Health + Job Trace screens | admin-ui-specification §6 | ☐ |
| 34 | Venue list + detail screens | admin-ui-specification §7.1 | ☐ |
| 35 | Discovery templates + coverage screens | admin-ui-specification §8 | ☐ |
| 36 | Config versions + model versions screens | admin-ui-specification §9 | ☐ |
| 37 | Users + Audit Log + Cost Report screens | admin-ui-specification §10 | ☐ |

### Phase 7 — CI/CD & Tests

| # | Task | Primary spec | Done? |
|---|------|-------------|-------|
| 38 | Write GitHub Actions workflows (all 7 from M1) | M1 | ☐ |
| 39 | Write unit tests for all Layer 1–8 critical paths | M7 | ☐ |
| 40 | Write Pact contract tests for import API | M7 | ☐ |
| 41 | Write Playwright E2E smoke tests | M7 | ☐ |

---

## Key constraints for Codex

**Never do these:**
- Write directly to the Artio application database from the mining service. All cross-service writes go through POST /api/pipeline/import only.
- Auto-promote a shadow confidence model. Promotion is always a manual admin action.
- Skip fingerprint deduplication before inserting a candidate record.
- Store secrets (API keys, MINING_SERVICE_SECRET) in the config store or any database table. They are env vars only.
- Call a real AI provider in tests. All AI calls must be mockable via the provider abstraction.
- Use `WidthType.PERCENTAGE` in any docx table (breaks in Google Docs).

**Always do these:**
- Validate all import API input with Zod before any DB write.
- Emit a `pipeline_telemetry` row for every stage execution (success, failure, and skip).
- Write `config_version` to every telemetry row and candidate record.
- Use `DATABASE_URL` (pooled) for application queries and `DATABASE_URL_DIRECT` (non-pooled) for migrations only.
- Check `mining_import_enabled` SiteSettings flag before making any import batch visible in the moderation queue.

---

## Document index

| Document | What it specifies |
|----------|------------------|
| layer1-pipeline-engine | BullMQ DAG, queue names, retry policy, circuit breaker, lock system |
| layer2-configuration-store | PipelineConfig schema, versioning model, runtime lookup |
| layer3-entity-store | Mining DB schema (all tables with DDL) |
| layer4-confidence-model | Signal vector (all signals), logistic regression, shadow mode |
| layer5-deduplication | Pass 1 fingerprint, Pass 2 embedding, cluster assignment |
| layer6-observability | pipeline_telemetry schema, dashboard queries, alert conditions |
| layer7-discovery | Thompson sampling bandit, template lifecycle, coverage tracking |
| layer8-import-api | Import endpoint spec, feedback endpoint, rollout plan |
| admin-ui-specification | Every admin screen, all actions, roles, empty/error states |
| ingest-system-spec | Legacy ingest system — read for context; do not extend |
| m1-infrastructure-spec | Fly.io config, all env vars, CI/CD workflows, secret rotation |
| m2-auth-user-management | NextAuth config, session strategy, invite flow, role guards |
| m3-database-schema | All new Artio-side pipeline tables (DDL) |
| m4-api-endpoint-map | All /api/admin/* routes with request/response shapes |
| m5-enrichment-layer | All 8 enrichment templates, priority queue, search/Wikipedia APIs |
| m6-model-training-ops | training_labels schema, weekly retraining job, serialisation format |
| m7-testing-strategy | Test tooling, unit/integration/contract/e2e test cases, coverage targets |
| m8-maturity-enrichment-criteria | All 6 maturity criteria, daily job logic, workflow state machine |
| m9-rollout-operations | Feature flags, 5-phase rollout, 5 on-call runbooks |
| supplement-normalise-stage | Full Normalise stage spec (field rules, ranking, fingerprint) |
| supplement-core-tables-ddl | Core Artio tables: venues, events, artists, artworks, assets |
