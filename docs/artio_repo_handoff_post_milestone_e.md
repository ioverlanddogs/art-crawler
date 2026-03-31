# Artio Data Master Centre — Repo Handoff (Post Milestone E)

Use this as the **source of truth and starting context for the next GPT/Codex session**.

---

## Project identity

Artio has evolved from a mining + moderation tool into a **governed data mastering and autonomous operations platform**.

### Current maturity
**Milestone E — COMPLETE**

Readiness intelligence + feedback optimization + governance policy automation are fully stabilized.

The platform now supports:
- single URL intake + batch URL intake
- full AI-assisted extraction + normalization + scoring pipeline
- human workbench review
- duplicate resolution + corroboration blockers
- publish governance + rollback preview
- audit continuity
- assignment + SLA operations
- scoped admin views
- replay + recovery studio
- recommendation engine
- self-healing source reliability
- publish readiness scoring
- feedback optimization loop
- bounded governance policy automation

---

## Monorepo structure

### App workspace
`packages/app`

Contains:
- Next.js admin web UI
- governance workflows
- publish controls
- duplicate resolution
- workbench review
- operations + SLA
- scoped admin surfaces
- replay + recovery studio
- self-healing admin UI
- readiness + governance intelligence
- audit + rollback continuity

#### Important admin folders
- `app/(admin)/dashboard`
- `app/(admin)/workbench`
- `app/(admin)/duplicates`
- `app/(admin)/publish`
- `app/(admin)/operations`
- `app/(admin)/recovery-studio`
- `app/(admin)/self-healing`

#### Important shared logic
- `lib/admin/publish-readiness.ts`
- `lib/admin/model-feedback.ts`
- `lib/admin/governance-policy.ts`
- `lib/admin/triage-recommendations.ts`
- `lib/admin/scope.ts`

### Mining workspace
`packages/mining`

Contains:
- URL discovery
- fetch / extract / normalize / score
- dedup
- export chain
- source health
- self-healing reliability
- fallback orchestration
- quarantine + release logic

#### Important shared logic
- `src/lib/model.ts`
- `src/lib/source-health.ts`
- `src/lib/self-healing.ts`
- `src/lib/stage-chaining.ts`

---

## Prisma / generated client stability

This was a major historical issue and is now stabilized.

### Important rule
**Always use wrapper modules, never direct generated paths.**

#### App
Use:
- `packages/app/lib/prisma-client.ts`

#### Mining
Use:
- `packages/mining/src/lib/prisma-client.ts`

### Never reintroduce
- brittle direct imports to generated/prisma
- test paths pointing directly at generated client folders

---

## Test stability

A **pretest hook now guarantees Prisma generation before app tests**.

This fixed:
- missing generated client in clean CI
- clean machine test failures
- Milestone E stabilization blocker

**Do not remove this hook.**

---

## Current milestone status

### COMPLETE
- Milestone A — canonical review + publish governance
- Milestone B — duplicates + data health control tower
- Milestone C — batch workflows + assignment + scope controls
- Milestone D — replay + recommendations + self-healing
- Milestone E — readiness + feedback + policy automation

### Current repo health
- milestone-clean for **E**
- app typecheck ✅
- mining typecheck ✅
- monorepo typecheck ✅
- app full suite ✅
- milestone stabilization suites ✅

---

## Critical safety invariants

These **must never be weakened**.

### Publish safety
- readiness scoring is advisory only
- no auto-publish
- staged release simulation is non-destructive
- publish blockers always win

### Duplicate safety
- unresolved duplicates block publish
- corroboration conflicts block publish
- recommendations may suggest strategy, never auto-merge

### Governance safety
- policy layer is bounded + deterministic
- scope-aware thresholds must not leak
- workspace rules must not bleed into global
- no hidden policy actions

### Replay safety
- non-dry-run replay requires explicit confirmation
- dry-run is read-only
- before/after diff must remain trustworthy

### Self-healing safety
- quarantine logic deterministic
- release readiness must be conservative
- false reversal distinct from recovery release
- no canonical mutation from mining automation

---

## Current key Milestone E files

### E1
- `lib/admin/publish-readiness.ts`
- publish queue + publish detail readiness UI

### E2
- `lib/admin/model-feedback.ts`
- operations optimization + calibrated confidence

### E3
- `lib/admin/governance-policy.ts`
- policy outputs in publish, operations, self-healing

### E stabilization
- `tests/milestone-e-stabilization.test.ts`
- app `package.json` pretest Prisma generate hook

---

## Recommended next milestone

# Milestone F — Autonomous Operations Orchestration

### F1 — Queue Orchestration Engine
- adaptive routing
- queue prioritization
- SLA-aware dispatch
- publish cohorting
- replay scheduling

### F2 — Adaptive Workload Optimization
- reviewer load balancing
- duplicate hotspot routing
- source-risk-based triage
- adaptive escalation trees

### F3 — Controlled Autonomous Rollout
- cohort publish rollout
- canary governance
- rollback circuit breakers
- staged trust promotion for sources/models

---

## Guidance for next GPT / Codex session

**Starter prompt:**

> Use this repo handoff as source of truth. First verify Milestone E state in the current repo, then draft the Milestone F sprint pack with Codex-ready prompts.

This should allow the next session to continue with:
- full architectural continuity
- zero milestone confusion
- immediate Milestone F execution planning
- Codex-ready sprint decomposition

---

## Continuity note

This handoff is intended to let the next chat continue from the **correct system state without re-discovery**.



---

# Milestone F — Execution-Grade Sprint Pack

This sprint pack converts the Milestone F recommendation into an implementation-ready sequence optimized for **Codex execution, safe parallelization, and regression containment**.

## Sprint objective
Deliver **Autonomous Operations Orchestration** without weakening Milestone E governance, publish, replay, duplicate, or self-healing invariants.

Primary outcome:
> reduce operator latency, improve SLA adherence, and introduce controlled autonomous rollout paths while preserving explicit human authority on irreversible actions.

---

## Execution order

Recommended implementation sequence:
1. **F1 — Queue Orchestration Engine**
2. **F2 — Adaptive Workload Optimization**
3. **F3 — Controlled Autonomous Rollout**
4. **F Stabilization + regression hardening**

Reasoning:
- orchestration primitives must exist before optimization
- optimization signals must stabilize before autonomy gates
- rollout controls depend on trustworthy queue + triage confidence

---

## F1 — Queue Orchestration Engine

### Goal
Introduce a deterministic orchestration layer for review, duplicate, replay, publish, and recovery queues.

### Core capabilities
- adaptive routing by queue type + SLA pressure
- priority score calculation
- reviewer / workspace dispatch recommendations
- publish cohort grouping
- replay scheduling windows
- starvation prevention logic

### File touch map
**Create**
- `packages/app/lib/admin/queue-orchestrator.ts`
- `packages/app/lib/admin/dispatch-priority.ts`
- `packages/mining/src/lib/replay-scheduler.ts`

**Update**
- `app/(admin)/operations/*`
- `app/(admin)/dashboard/*`
- `lib/admin/triage-recommendations.ts`

### Acceptance criteria
- every queue item receives deterministic priority metadata
- SLA breach risk reorders only within scope boundaries
- replay jobs can be scheduled without mutating live state
- publish cohorts remain advisory until explicit human release

### Codex prompt
> Implement F1 queue orchestration using deterministic scoring and scope-safe routing. Add shared orchestration helpers, admin queue views, and replay scheduling primitives. Preserve non-destructive publish and replay invariants.

---

## F2 — Adaptive Workload Optimization

### Goal
Optimize human + AI operational throughput using risk-aware routing and reviewer balancing.

### Core capabilities
- reviewer load balancing
- duplicate hotspot escalation
- source-risk weighted triage
- expertise-aware assignment recommendations
- adaptive escalation trees
- confidence-calibrated reviewer fallback

### File touch map
**Create**
- `packages/app/lib/admin/workload-optimizer.ts`
- `packages/app/lib/admin/escalation-tree.ts`
- `packages/app/lib/admin/reviewer-balance.ts`

**Update**
- `app/(admin)/workbench/*`
- `app/(admin)/duplicates/*`
- `app/(admin)/operations/*`
- `lib/admin/model-feedback.ts`

### Acceptance criteria
- no reviewer exceeds configured load ceiling
- duplicate hotspots auto-route for review only
- high-risk sources escalate faster but never bypass blockers
- workspace expertise rules remain scope-aware

### Codex prompt
> Implement F2 adaptive workload optimization with reviewer balancing, risk-based triage, and deterministic escalation trees. Reuse Milestone E feedback calibration and ensure no automatic resolution actions are introduced.

---

## F3 — Controlled Autonomous Rollout

### Goal
Enable bounded autonomy for safe staged releases and source trust promotion.

### Core capabilities
- cohort publish rollout plans
- canary governance checks
- rollback circuit breakers
- staged source trust promotion
- model confidence trust bands
- autonomous halt on blocker drift

### File touch map
**Create**
- `packages/app/lib/admin/autonomous-rollout.ts`
- `packages/app/lib/admin/circuit-breakers.ts`
- `packages/mining/src/lib/source-trust-promotion.ts`

**Update**
- `app/(admin)/publish/*`
- `app/(admin)/self-healing/*`
- `lib/admin/governance-policy.ts`
- `lib/admin/publish-readiness.ts`

### Acceptance criteria
- canary cohorts simulate before human approval
- rollback breakers trigger before destructive release
- trust promotion never mutates canonical records directly
- blocker drift forces rollout halt + explicit acknowledgment

### Codex prompt
> Implement F3 controlled autonomous rollout with canary governance, circuit breakers, and conservative source trust promotion. All publish actions must remain human-confirmed and blocker-first.

---

## Regression guardrails

### Required new test suites
- `tests/milestone-f-queue-orchestration.test.ts`
- `tests/milestone-f-workload-optimization.test.ts`
- `tests/milestone-f-autonomous-rollout.test.ts`
- `tests/milestone-f-safety-invariants.test.ts`

### Must-keep inherited suites
- `tests/milestone-e-stabilization.test.ts`
- full app suite
- monorepo typecheck
- Prisma pretest generation hook

### Non-negotiable assertions
- no auto-publish paths introduced
- duplicate blockers override queue priority
- replay dry-run fidelity preserved
- self-healing cannot promote unsafe source states
- scoped rules never cross tenant/workspace boundaries

---

## Delivery slices

### Slice 1
F1 shared orchestration libraries + dashboard surfacing

### Slice 2
F1 replay scheduler + publish cohort simulation

### Slice 3
F2 reviewer balancing + hotspot routing

### Slice 4
F2 escalation trees + calibration reuse

### Slice 5
F3 canary rollout + rollback breakers

### Slice 6
F stabilization, regression suites, CI hardening

---

## Definition of done
Milestone F is complete only when:
- orchestration is deterministic
- workload optimization is measurable
- autonomy remains bounded and human-confirmed
- all Milestone E suites stay green
- new F stabilization suites are green in clean CI

