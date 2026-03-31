# Sprint 6 — Audit trail, record versioning, and polish

## Goal
Add canonical record versioning so every publish creates a recoverable snapshot. Build the audit history view. Wire the review queue page to show the new intake pipeline items alongside existing mining-import items. Polish the workbench UX with confidence visualisation and evidence highlighting.

## Context
After Sprint 5, the full URL-to-publish workflow is functional. This sprint adds the operational durability and visibility features that make the system trustworthy in production: "who approved this, from which source, when?" must be answerable for every public record.

---

## Task 1 — `CanonicalRecordVersion` schema addition

Add to `packages/app/prisma/schema.prisma`:

```prisma
model CanonicalRecordVersion {
  id              String   @id @default(cuid())
  eventId         String
  versionNumber   Int
  dataJson        Json
  changeSummary   String?
  sourceDocumentId String?
  proposedChangeSetId String?
  publishBatchId  String?
  createdByUserId String?
  createdAt       DateTime @default(now())

  event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)

  @@unique([eventId, versionNumber])
  @@index([eventId, createdAt(sort: Desc)])
}
```

Add back-relation to `Event`:
```prisma
// Inside model Event:
versions CanonicalRecordVersion[]
```

Run `npm run prisma:generate -w @artio/app` and `npm run prisma:push -w @artio/app`.

---

## Task 2 — Version snapshot on publish

Update `packages/app/app/api/admin/publish/[eventId]/route.ts`.

After updating `Event.publishStatus = 'published'`, create a `CanonicalRecordVersion`:

```ts
// Find the highest existing version number for this event
const lastVersion = await prisma.canonicalRecordVersion.findFirst({
  where: { eventId },
  orderBy: { versionNumber: 'desc' },
  select: { versionNumber: true }
});
const nextVersion = (lastVersion?.versionNumber ?? 0) + 1;

await prisma.canonicalRecordVersion.create({
  data: {
    eventId,
    versionNumber: nextVersion,
    dataJson: { /* all current Event fields */ },
    changeSummary: body.releaseSummary ?? null,
    sourceDocumentId: proposedChangeSet.sourceDocumentId,
    proposedChangeSetId: proposedChangeSet.id,
    publishBatchId: publishBatch.id,
    createdByUserId: session.user.id
  }
});
```

The `dataJson` snapshot should include: `title`, `startAt`, `endAt`, `timezone`, `location`, `description`, `sourceUrl`, `publishStatus`, `publishedAt`.

---

## Task 3 — Rollback API route

Create `packages/app/app/api/admin/publish/[eventId]/rollback/route.ts`:

```ts
POST /api/admin/publish/[eventId]/rollback
Auth: requireRole(['admin'])
Body: { versionNumber: number; reason: string }
Response 200: { rolledBack: true; versionNumber: number }
Response 404: event or version not found
Response 400: cannot rollback to current version
```

On POST:
1. Load the `CanonicalRecordVersion` for the given `versionNumber`.
2. Apply `dataJson` fields back to the `Event` record. Set `publishStatus = 'rolled_back'`.
3. Create a new `CanonicalRecordVersion` with `changeSummary: "Rollback to v{versionNumber}: {reason}"`, `versionNumber = latestVersion + 1`.
4. Log to `PipelineTelemetry`: `stage: 'rollback'`, `status: 'success'`, `entityId: eventId`, `metadata: { rolledBackToVersion: versionNumber, reason }`.
5. Return `{ rolledBack: true, versionNumber }`.

---

## Task 4 — Audit history API route

Create `packages/app/app/api/admin/audit/route.ts`:

```ts
GET /api/admin/audit?entityId=&entityType=&page=1&pageSize=50
Auth: requireRole(['viewer', 'moderator', 'operator', 'admin'])
Response: paginated list of audit events
```

An "audit event" is a unified view assembled from:
- `CanonicalRecordVersion` rows (event type: `published`, `rolled_back`).
- `ProposedChangeSet` rows with `reviewStatus: 'merged' | 'rejected'` (event type: `approved`, `rejected`).
- `IngestionJob` rows (event type: `intake_started`, `intake_failed`).
- `PipelineTelemetry` rows where `stage = 'ai_extraction'` (event type: `extraction_run`).

Each returned item must have the shape:
```ts
{
  id: string;
  eventType: string;
  entityId: string;
  entityType: string;
  actorUserId: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  createdAt: string; // ISO
}
```

Assemble in TypeScript (not a SQL union) — run four Prisma queries, merge and sort by `createdAt` descending, then paginate. When `entityId` is provided filter each query to that entity. When `entityType` is `'Event'` query by `eventId`; when `entityType` is `'SourceDocument'` query by `sourceDocumentId`.

---

## Task 5 — Audit history page

Create `packages/app/app/(admin)/audit/page.tsx` as a server component.

Layout:
- `PageHeader` title "Audit history" description "Every intake, review, approval, and publish event."
- A filter bar with: entity ID input, entity type selector (Event / SourceDocument / all).
- A timeline table (use the existing `AuditLogTable` component from `packages/app/components/admin/AuditLogTable.tsx` if its interface is compatible — inspect it first and adapt if needed).
- Paginated with "Load more" or page controls.

---

## Task 6 — Review queue unified view

Update `packages/app/app/(admin)/moderation/page.tsx` (or create a new `/review` page — choose whichever requires less disruption to the existing moderation page).

Preferred approach: add a tab bar or section toggle at the top of the existing moderation page that lets operators switch between:
- "Mining imports" — the existing `ModerationClient` queue (unchanged).
- "Intake jobs" — a new list of `IngestionJob` rows with `status: 'needs_review'`, showing source URL, job age, and an "Open workbench" link per row.

The tab toggle should be implemented as a URL query param (`?queue=mining` vs `?queue=intake`) so it survives page refreshes and can be linked to directly.

---

## Task 7 — Workbench confidence visualisation

Update `packages/app/app/(admin)/workbench/[changeSetId]/WorkbenchClient.tsx`.

In the `ProposedFieldsPanel`, replace the plain confidence percentage with a small horizontal bar:
- Full width of the field name column.
- Fill colour: green (≥75%), amber (≥50%), red (<50%).
- Height: 4px, rounded, below the field name.
- Accessible: `aria-label="Confidence: {value}%"`.

Also update the source evidence left pane: when a field row is focused in the centre pane, scroll the evidence text to the matching snippet and highlight it with a yellow `<mark>` tag. Use `scrollIntoView` on the mark element. The `evidenceJson` from `ExtractionRun` provides the snippet text — search for it in `extractedText` using `indexOf`.

---

## Task 8 — Version history panel in workbench

In the `CanonicalComparisonPanel` (right pane of the workbench), add a "Version history" section below the diff table.

Show the 5 most recent `CanonicalRecordVersion` rows for the matched event (if any). Each row: version number, created at, created by, change summary, a "Rollback to this version" button (admin only — hide for other roles).

Fetch version history from a new GET route:

```ts
GET /api/admin/publish/[eventId]/versions
Auth: requireRole(['viewer', 'moderator', 'operator', 'admin'])
Response: last 10 CanonicalRecordVersion rows for the event
```

---

## Task 9 — Unit and integration tests

Create `packages/app/tests/versioning.test.ts`.

Test:
- Publishing an event creates a `CanonicalRecordVersion` with `versionNumber: 1`.
- Publishing the same event again creates `versionNumber: 2`.
- Rollback applies the previous version's `dataJson` to the `Event` and creates a new version entry.
- Rollback to the current version returns 400.

Create `packages/app/tests/audit-route.test.ts`.

Test:
- Returns unified audit events from all four sources.
- `entityId` filter limits results to that entity.
- Returns results sorted by `createdAt` descending.
- Pagination works correctly.

Update `packages/app/tests/admin-api-authz-regressions.test.ts` to add:
- `canonicalRecordVersion: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() }` to `prismaMock`.
- A test that rollback returns 403 for operator role (admin-only).

---

## Acceptance criteria
- `npm run typecheck -w @artio/app` exits 0.
- `npm run test -w @artio/app` exits 0.
- Every publish creates a `CanonicalRecordVersion` row with correct snapshot data.
- Rollback by an admin reverts the event fields and creates a new version entry.
- Rollback by an operator returns 403.
- The audit page shows intake, review, publish, and rollback events in chronological order.
- The review queue page shows both mining imports and intake jobs in separate sections switchable by URL param.
- Confidence bars render in the workbench centre pane.
- Evidence highlighting scrolls to the relevant snippet when a field is focused.
- All existing tests pass.
