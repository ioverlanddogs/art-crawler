# Sprint 4 — Review workbench

## Goal
Build the three-pane record workbench: source evidence on the left, field-by-field review in the centre, canonical comparison on the right. Wire up field accept/reject/edit decisions to `FieldReview` rows. Implement the merge-into-canonical path and the publish-readiness gate.

## Context
After Sprint 3, intake jobs land in `needs_review` status with a `ProposedChangeSet` record. This sprint builds the workbench at `/workbench/[proposedChangeSetId]` that an operator uses to review and approve each field, then merge the approved data into an `Event` record.

The existing moderation page at `/moderation` is untouched — it remains for bulk mining-import review. The workbench is the single-URL deep-review interface.

---

## Task 1 — Diff computation service

Create `packages/app/lib/intake/compute-diff.ts`.

Implement `computeDiff(proposed: Record<string, unknown>, canonical: Record<string, unknown> | null): DiffResult` where:

```ts
export type DiffFieldState = 'added' | 'updated' | 'unchanged' | 'conflicting' | 'rejected';

export interface DiffField {
  fieldPath: string;
  proposedValue: unknown;
  canonicalValue: unknown;
  state: DiffFieldState;
}

export interface DiffResult {
  fields: DiffField[];
  hasConflicts: boolean;
  addedCount: number;
  updatedCount: number;
  unchangedCount: number;
}
```

Rules:
- If `canonical` is null, all proposed fields are `'added'`.
- If canonical has no value for a field and proposed does: `'added'`.
- If both have the same value (strict equality after JSON serialization): `'unchanged'`.
- If both have values and they differ: `'updated'` (or `'conflicting'` if a `FieldReview` for that field already exists with `decision: 'rejected'`).
- Only consider top-level keys (no deep diff in this sprint).

---

## Task 2 — Publish-readiness validation service

Create `packages/app/lib/intake/publish-gate.ts`.

Implement `checkPublishReadiness(proposedChangeSet: ProposedChangeSetWithReviews): PublishGateResult` where:

```ts
export interface PublishGateResult {
  ready: boolean;
  blockers: string[];
  warnings: string[];
}

type ProposedChangeSetWithReviews = {
  proposedDataJson: Record<string, unknown> | null;
  fieldReviews: Array<{ fieldPath: string; decision: string | null; confidence: number | null }>;
};
```

Required fields that block publish if missing or rejected: `title`, `startAt`.

Blocking conditions:
- `title` is missing from `proposedDataJson` or its `FieldReview.decision` is `'rejected'`: add blocker "Required field 'title' is missing or rejected."
- `startAt` is missing or rejected: add blocker "Required field 'startAt' is missing or rejected."
- Any `FieldReview` with `decision` still null (unreviewed): add blocker `"${count} field(s) have not been reviewed."`

Warning conditions:
- Any `FieldReview` with `confidence` below 0.5 and `decision` of `'accepted'`: add warning "Low-confidence field accepted: {fieldPath}."

Return `{ ready: blockers.length === 0, blockers, warnings }`.

---

## Task 3 — Field review API routes

Create `packages/app/app/api/admin/workbench/[changeSetId]/fields/route.ts`:

```ts
GET /api/admin/workbench/[changeSetId]/fields
Auth: requireRole(['viewer', 'moderator', 'operator', 'admin'])
Response: ProposedChangeSet with fieldReviews and sourceDocument (extractedText + metadataJson)
          and matchedEvent if present
          and diffResult computed from computeDiff
```

Create `packages/app/app/api/admin/workbench/[changeSetId]/fields/[fieldPath]/route.ts`:

```ts
PATCH /api/admin/workbench/[changeSetId]/fields/[fieldPath]
Auth: requireRole(['operator', 'admin'])
Body: { decision: FieldDecision, editedValue?: unknown, reviewerComment?: string }
Response: updated FieldReview row
```

On PATCH:
- Upsert a `FieldReview` row for the given `(proposedChangeSetId, fieldPath)`.
- If `editedValue` is provided, update `ProposedChangeSet.proposedDataJson` at the given field path.
- Set `reviewerId` from the session user ID.

---

## Task 4 — Approve and merge API route

Create `packages/app/app/api/admin/workbench/[changeSetId]/approve/route.ts`:

```ts
POST /api/admin/workbench/[changeSetId]/approve
Auth: requireRole(['operator', 'admin'])
Body: { mergeStrategy: 'create_new' | 'merge_existing' }
Response 200: { eventId: string; created: boolean }
Response 409: publish gate blockers (list of blocker strings)
```

On POST:
1. Load the `ProposedChangeSet` with all `FieldReview` rows.
2. Run `checkPublishReadiness`. If not ready, return `409` with `{ blockers, warnings }`.
3. Build the merged event data from `proposedDataJson`, overriding with any `editedValue` from accepted `FieldReview` rows.
4. If `mergeStrategy === 'create_new'`: create a new `Event` record from the merged data. Set `Event.publishStatus = 'ready'`, `Event.sourceUrl = sourceDocument.sourceUrl`.
5. If `mergeStrategy === 'merge_existing'` and `matchedEventId` is set: update the existing `Event` with the merged fields. Set `publishStatus = 'ready'`.
6. Update `ProposedChangeSet.reviewStatus = 'merged'`, `reviewedAt`, `reviewedByUserId`.
7. Update `IngestionJob.status = 'approved'` (find via `sourceDocumentId`).
8. Return `{ eventId, created: mergeStrategy === 'create_new' }`.

---

## Task 5 — Reject changeset API route

Create `packages/app/app/api/admin/workbench/[changeSetId]/reject/route.ts`:

```ts
POST /api/admin/workbench/[changeSetId]/reject
Auth: requireRole(['operator', 'admin'])
Body: { reason: string }
Response 200: { rejected: true }
```

Updates `ProposedChangeSet.reviewStatus = 'rejected'`, `notes = reason`. Updates `IngestionJob.status = 'failed'`, `errorCode = 'operator_rejected'`, `errorMessage = reason`.

---

## Task 6 — Workbench page (three-pane layout)

Create `packages/app/app/(admin)/workbench/[changeSetId]/page.tsx` as a server component that fetches the changeset and passes initial data to a client component.

Create `packages/app/app/(admin)/workbench/[changeSetId]/WorkbenchClient.tsx` as a `'use client'` component.

**Layout**: use a CSS grid with three columns — left 280px, centre flex-1, right 320px. Add this class to `globals.css` rather than inline styles so it's reusable.

**Left pane — Source evidence** (`SourceEvidencePanel`):

- Heading: "Source evidence"
- Show `sourceDocument.sourceUrl` as a link (opens in new tab).
- Show fetch metadata: HTTP status, content type, fetched at.
- Show `extractedText` in a scrollable `<pre>` block, capped at 3000 characters with a "Show more" toggle.
- When a field row in the centre pane is focused, highlight any evidence snippet from `ExtractionRun.evidenceJson[fieldPath]` in the text using a `<mark>` tag. Implement this with a `focusedField` state passed down from the parent.

**Centre pane — Proposed fields** (`ProposedFieldsPanel`):

Render one row per field in `proposedDataJson`. Each row shows:
- Field name (left-aligned, monospace).
- Proposed value (truncated to 80 chars).
- Confidence as a percentage with a colour-coded pill: ≥75% green, ≥50% amber, <50% red.
- Current decision badge: accepted (green), rejected (red), edited (blue), uncertain (amber), unreviewed (gray).
- Three action buttons: "Accept", "Edit", "Reject" (icon buttons, keyboard accessible).

On "Edit": show an inline text input pre-filled with the proposed value. On save, PATCH to the field route.

On any decision: PATCH the field route, update local state optimistically.

Keyboard shortcuts (only when not focused in an input):
- `a` → accept focused field
- `r` → reject focused field
- `e` → open edit for focused field
- `↓` / `↑` → move focus between fields

**Right pane — Canonical comparison** (`CanonicalComparisonPanel`):

- If `matchedEvent` exists: show a diff table. Each row: field name, current canonical value, proposed value, diff state badge (added/updated/unchanged/conflicting).
- If no match: show "No existing record — will create new event on approval."
- Show merge strategy selector: radio between "Create new record" and "Merge into existing" (disabled if no match).
- Show publish-readiness summary: blockers in red, warnings in amber, "Ready to approve" in green.

**Footer action bar**:
- "Approve and merge" button — calls the approve route with the selected merge strategy. On 409 show blockers inline. On success redirect to `/intake/[ingestionJobId]` with a success toast.
- "Save draft" button — sets `ProposedChangeSet.reviewStatus = 'draft'` via a PATCH to `/api/admin/workbench/[changeSetId]` (add this minimal PATCH route).
- "Reject import" button (destructive) — opens a `ConfirmDialog`, then calls the reject route.

---

## Task 7 — Add workbench to admin nav

In `packages/app/app/(admin)/layout.tsx`, do **not** add workbench to the main nav — it is a contextual page reached from intake job detail or the review queue. Ensure the layout correctly applies the admin shell to the `/workbench` segment by confirming the route group covers it.

---

## Task 8 — Unit tests

Create `packages/app/tests/workbench-service.test.ts`.

Test:
- `computeDiff`: null canonical → all fields added. Matching values → unchanged. Differing values → updated.
- `checkPublishReadiness`: missing title → blocked. All fields reviewed, required fields accepted → ready. Unreviewed fields → blocked. Low-confidence accepted field → warning only (not blocked).

Create `packages/app/tests/workbench-routes.test.ts`.

Test:
- `GET /api/admin/workbench/[changeSetId]/fields`: 404 for unknown ID, 200 with diff included.
- `PATCH /api/admin/workbench/[changeSetId]/fields/[fieldPath]`: 403 for viewer, 200 for operator, upserts FieldReview.
- `POST /api/admin/workbench/[changeSetId]/approve`: 409 when publish gate fails, 200 when gate passes and `create_new` strategy creates an Event.
- `POST /api/admin/workbench/[changeSetId]/reject`: 200, sets changeset to rejected.

---

## Acceptance criteria
- `npm run typecheck -w @artio/app` exits 0.
- `npm run test -w @artio/app` exits 0.
- The workbench loads at `/workbench/[changeSetId]` and shows all three panes.
- Clicking "Accept" on a field creates a `FieldReview` with `decision: 'accepted'`.
- Clicking "Edit", changing the value, and saving updates both the `FieldReview` and `proposedDataJson`.
- "Approve and merge" with all required fields accepted creates an `Event` with `publishStatus: 'ready'`.
- "Approve and merge" with an unreviewed required field returns blockers and does not create the Event.
- "Reject import" sets the changeset to rejected and the job to failed.
- Keyboard shortcuts `a`, `r`, `e` work on the focused field row.
