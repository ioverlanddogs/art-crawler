# Sprint 3 — Intake UI and dashboard integration

## Goal
Build the intake section of the admin UI: URL submission form on the dashboard, intake job list page, and intake result page that links through to the review workbench (stubbed). Update the dashboard to show intake zone stats.

## Context
After Sprint 2, the intake API routes exist at `/api/admin/intake`. The existing admin shell is in `packages/app/components/admin/AdminShell.tsx` and the dashboard is `packages/app/app/(admin)/dashboard/page.tsx`. The existing component library in `packages/app/components/admin/` includes `SectionCard`, `PageHeader`, `StatusBadge`, `MetricCard`, `EmptyState`, `ConfirmDialog`, and `ActionButton` — use these rather than writing new primitives.

All new pages live inside `packages/app/app/(admin)/` using the existing admin layout.

---

## Task 1 — Add intake to the admin nav

In `packages/app/app/(admin)/layout.tsx`, add a nav item for Intake pointing to `/intake`. It should appear between Dashboard and Moderation in the nav order. Use whatever nav rendering pattern already exists in the layout file.

---

## Task 2 — URL intake form component

Create `packages/app/components/admin/intake/IntakeForm.tsx` as a `'use client'` component.

Props:
```ts
interface IntakeFormProps {
  onSuccess: (result: { ingestionJobId: string; proposedChangeSetId: string | null }) => void;
}
```

The form has:
- A URL input field (full width, placeholder: "https://example.com/events/gallery-opening").
- An optional "Source label" text input.
- An optional "Notes" textarea (3 rows max).
- A submit button labelled "Ingest and parse".
- A secondary button labelled "Cancel" that clears the form.

Behaviour:
- On submit, POST to `/api/admin/intake` with the form values.
- Show a spinner in the submit button while the request is in flight. Disable the button.
- On 201: call `onSuccess` with the result.
- On 4xx: display the error message from the response body inline below the form. Do not redirect.
- On network error: show "Network error — please try again."

Do not use an HTML `<form>` tag. Use `onClick` handlers on buttons. Validate the URL client-side with a simple `URL` constructor check before submitting — show "Please enter a valid URL" inline if invalid.

---

## Task 3 — Intake job status badge component

Create `packages/app/components/admin/intake/IntakeJobStatusBadge.tsx`.

A small badge that maps `IngestionJobStatus` to a tone:
- `queued`, `fetching`, `extracting`, `parsing`, `matching` → `'info'` (in progress)
- `needs_review` → `'warning'`
- `approved`, `publishing`, `published` → `'success'`
- `failed` → `'danger'`

Use the existing `StatusBadge` component from `@/components/admin` for rendering. This wrapper just handles the tone mapping.

---

## Task 4 — Intake job list page

Create `packages/app/app/(admin)/intake/page.tsx` as a server component.

Behaviour:
- Fetch the first page (20 items) of jobs from `/api/admin/intake` server-side using the Prisma client directly (same pattern as the dashboard page — query Prisma in the server component, do not call the HTTP API from the server).
- Show a `PageHeader` with title "Intake" and description "Submit a URL to ingest and track parsing progress."
- Show the `IntakeForm` in a `SectionCard` titled "New import".
- Below, show a `SectionCard` titled "Recent jobs" with a table of jobs:
  - Columns: Source URL (truncated to 60 chars), Status (use `IntakeJobStatusBadge`), Started, Completed, Actions.
  - Actions column: "Open" link to `/intake/[id]`.
- Show `EmptyState` if there are no jobs.
- The page must re-validate on every request (`export const dynamic = 'force-dynamic'`).

Handle the `onSuccess` callback from `IntakeForm` by redirecting to `/intake/[ingestionJobId]` using `useRouter` — the form component receives `onSuccess` from a thin client wrapper around the server component data.

The cleanest pattern: make `IntakePageClient.tsx` a `'use client'` wrapper that handles the form success redirect, and keep the job table in the server component.

---

## Task 5 — Intake job detail page

Create `packages/app/app/(admin)/intake/[id]/page.tsx` as a server component.

Fetch from `GET /api/admin/intake/[id]` (or directly from Prisma — same pattern as Task 4). Show 404 if not found.

Layout:
- `PageHeader` with title "Import job" and the source URL as the description.
- A status timeline strip showing each `IngestionJobStatus` stage in order, with the current status highlighted and failed status marked in red. This is a presentational component — implement it inline or as `IntakeJobTimeline.tsx`.
- Two `SectionCard` side by side (use a `two-col` div matching existing dashboard layout):
  - Left: "Fetch summary" — show `httpStatus`, `contentType`, `fetchedAt`, `finalUrl`, `fingerprint`. If `errorMessage` is set, show it prominently.
  - Right: "Extraction preview" — show the top 5 extracted fields from `ExtractionRun.extractedFieldsJson` as a simple key/value table. Show `modelVersion` and `parserVersion`. If no extraction run exists yet, show `EmptyState`.
- A full-width `SectionCard` "Next step" that shows:
  - If status is `needs_review`: a prominent "Open review workbench" button linking to `/workbench/[proposedChangeSetId]` (the workbench is built in Sprint 4 — the link can 404 for now).
  - If status is `failed`: a "Retry" button that POSTs to `/api/admin/intake/[id]/retry` (stub this route in Task 6).
  - Otherwise: a status message matching the current stage.

---

## Task 6 — Retry route stub

Create `packages/app/app/api/admin/intake/[id]/retry/route.ts`:

```ts
POST /api/admin/intake/[id]/retry
Auth: requireRole(['operator', 'admin'])
```

For now, this route should:
1. Find the `IngestionJob` by ID. Return 404 if not found.
2. Check the job status is `failed`. Return `400` with `code: 'NOT_RETRYABLE'` if not.
3. Reset the job to `status: 'queued'`, clear `errorCode` and `errorMessage`, update `startedAt`.
4. Return `200` with `{ queued: true }`.

The actual re-run logic (calling `runIntake` again) is deferred — this sprint only sets the status so the UI can show the updated state.

---

## Task 7 — Dashboard intake zone

Update `packages/app/app/(admin)/dashboard/page.tsx`.

Add a new intake stats row above the existing "Pending moderation" metric. This requires two new Prisma queries inside the existing `Promise.all`:

```ts
// Add to the Promise.all array:
safeQuery(() => prisma.ingestionJob.count({ where: { status: 'needs_review' } }), 0),
safeQuery(() => prisma.ingestionJob.count({ where: { status: 'failed', createdAt: { gte: since24h } } }), 0),
```

Display them as two `MetricCard` entries in the existing `stats-grid`:
- "Needs review" (count, link to `/intake?status=needs_review`, state: `pendingReview > 10 ? 'degraded' : 'healthy'`).
- "Intake failures 24h" (count, link to `/intake?status=failed`, state: `intakeFailed > 0 ? 'degraded' : 'healthy'`).

Also add a "Quick action" intake form inline on the dashboard in the existing header quick-actions area. This is a simple link button ("+ Ingest URL") that navigates to `/intake` — not an inline form on the dashboard.

---

## Task 8 — Export new components from index

Update `packages/app/components/admin/index.ts` to export:
- `IntakeForm` from `./intake/IntakeForm`
- `IntakeJobStatusBadge` from `./intake/IntakeJobStatusBadge`

---

## Task 9 — Tests

Create `packages/app/tests/intake-ui.test.ts`.

Test the client-side form component logic (not rendering — follow the existing test style which tests route handlers, not React components):

- Test the retry route: 404 for unknown ID, 400 for non-failed job, 200 for a failed job that gets reset to queued.
- Test the intake GET list route: returns paginated results, respects `status` filter.
- Test the intake GET detail route: returns 404 for unknown ID, returns full nested result for known ID.

---

## Acceptance criteria
- `npm run typecheck -w @artio/app` exits 0.
- `npm run test -w @artio/app` exits 0.
- Navigating to `/intake` shows the URL form and recent jobs table.
- Submitting a valid URL from the form creates a job and redirects to the job detail page.
- The job detail page shows the timeline, fetch summary, and extraction preview.
- The dashboard shows intake stats without breaking existing dashboard data.
- A `moderator` can view the intake list but cannot submit a new intake (POST returns 403).
