# Milestone A Sprint Pack — Artio Data Master Centre

## Milestone objective
Complete the **core mastering loop** so one URL can become one trustworthy published canonical record through a fully reviewable admin workflow.

This sprint pack is optimized for **Codex execution** and maps directly to the current repo structure.

---

# Sprint structure
Milestone A is split into **3 execution sprints**.

## Sprint A1 — Review Workbench v2
### Goal
Upgrade the current workbench into a complete operator-grade review surface.

### Scope
#### Frontend
- Upgrade `app/(admin)/workbench/[changeSetId]/page.tsx`
- Introduce 3-pane layout:
  - source evidence
  - extracted proposed fields
  - canonical comparison
- Add field actions:
  - accept
  - reject
  - edit
  - mark uncertain
- Add confidence + provenance badges
- Add validation blockers panel
- Add approve-all-safe-fields CTA
- Add request re-parse CTA

#### Backend
- Expand workbench API routes for field-level decisions
- Persist reviewer notes
- Support batch field decision save
- Add re-parse action endpoint

### Acceptance criteria
- Operator can fully review one record without leaving page
- Every field shows confidence and provenance
- Blocking validation issues are visible
- Approve-all only applies to valid high-confidence fields

---

## Sprint A2 — Publish governance + version UX
### Goal
Make publish intentional, safe, and reversible.

### Scope
#### Frontend
- Improve `app/(admin)/publish/page.tsx`
- Add publish details drawer/page:
  - change summary
  - fields changed
  - reviewer
  - evidence coverage
  - blockers
- Improve rollback UX in audit/version surfaces
- Add version comparison view

#### Backend
- Expand publish routes for:
  - publish summary
  - release note
  - rollback preview
- Ensure version history is linked to CanonicalRecordVersion

### Acceptance criteria
- Publish queue clearly distinguishes blocked vs ready
- Every publish action shows exact changed fields
- Rollback preview works before destructive action
- Published records link to audit/version history

---

## Sprint A3 — Route continuity + production polish
### Goal
Make the mastering loop feel like one coherent journey.

### Scope
#### Navigation continuity
- dashboard → intake detail
- intake detail → workbench
- workbench → publish queue
- publish queue → audit trail

#### UX states
- loading skeletons
- empty states
- background refresh / polling for async jobs
- success/error toasts
- destructive confirmations

#### Tests
- E2E for:
  - intake → workbench
  - workbench → publish
  - publish → rollback

### Acceptance criteria
- No dead-end pages
- No silent async failures
- Route transitions preserve operator context
- E2E mastering loop passes

---

# Repo implementation map
## Pages
- `packages/app/app/(admin)/dashboard/page.tsx`
- `packages/app/app/(admin)/intake/[id]/page.tsx`
- `packages/app/app/(admin)/workbench/[changeSetId]/page.tsx`
- `packages/app/app/(admin)/publish/page.tsx`
- `packages/app/app/(admin)/audit/page.tsx`

## APIs
- `packages/app/app/api/admin/intake/**`
- `packages/app/app/api/admin/workbench/**`
- `packages/app/app/api/admin/publish/**`
- `packages/app/app/api/admin/audit/**`

## Domain models
- `SourceDocument`
- `ExtractionRun`
- `ProposedChangeSet`
- `FieldReview`
- `CanonicalRecordVersion`
- `PublishBatch`

---

# Definition of done for Milestone A
Milestone A is complete when:
- one URL can be ingested
- extracted fields are fully reviewable
- provenance is visible
- approved changes merge into canonical draft
- publish queue is explicit
- rollback/version diff is operator-safe
- full intake → review → publish → audit flow passes E2E

---

# Codex execution prompt — Milestone A
Copy the prompt below into Codex.

```text
Execute Milestone A for the Artio Data Master Centre.

Goal:
Complete the core mastering loop so one URL can move from intake through review, publish, and rollback with a polished operator-grade admin experience.

You must implement the work in 3 tightly scoped sprints.

SPRINT A1 — Review Workbench v2
Tasks:
- Upgrade `packages/app/app/(admin)/workbench/[changeSetId]/page.tsx`
- Build a 3-pane workbench:
  1) source evidence
  2) extracted proposed fields
  3) canonical comparison
- Add field-level controls:
  - accept
  - reject
  - edit
  - mark uncertain
- Add confidence and provenance indicators per field
- Add validation blocker summary panel
- Add approve-all-safe-fields action
- Add request re-parse action
- Expand matching admin API routes to persist field decisions and reviewer notes

Success criteria:
- one operator can complete review on one record without leaving the page
- every key field shows confidence + provenance
- blocking issues are explicit

SPRINT A2 — Publish governance and version UX
Tasks:
- Improve `packages/app/app/(admin)/publish/page.tsx`
- Add publish detail surface with:
  - changed fields
  - evidence coverage
  - reviewer
  - blockers
- Improve rollback UX from audit/version pages
- Add version diff comparison view
- Expand publish routes for release summaries and rollback preview

Success criteria:
- every publish action is explicit and reversible
- rollback preview works before destructive action
- published items link cleanly into audit trail

SPRINT A3 — Route continuity and production polish
Tasks:
- Ensure seamless transitions:
  - dashboard -> intake detail
  - intake detail -> workbench
  - workbench -> publish
  - publish -> audit
- Add loading/empty/error states
- Add polling or background refresh for async jobs
- Add confirmation dialogs for destructive actions
- Add focused E2E coverage for full mastering loop

Success criteria:
- no dead-end pages
- no silent failures
- full loop passes E2E

Implementation rules:
- Keep repo structure aligned to existing admin routes
- Reuse existing admin shell/components where possible
- Do not refactor unrelated auth or pipeline logic
- Prefer small composable UI components over page bloat
- Preserve current role-based access behavior

Deliverables:
1) code changes
2) migration/model updates if needed
3) tests
4) concise summary by sprint
5) exact verification commands run
```

---

## Planning note
Best practice is to align milestones to 2–3 sprint slices with explicit acceptance criteria and a release-hardening buffer before the next milestone. ([docs.gitscrum.com](https://docs.gitscrum.com/en/best-practices/milestone-based-project-tracking/?utm_source=chatgpt.com))

