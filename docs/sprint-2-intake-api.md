# Sprint 2 — Intake API and service layer

## Goal
Build the backend for single-URL intake: submit a URL, fetch and fingerprint the source, create the `SourceDocument` and `IngestionJob`, and stub the extraction step so the job progresses to `needs_review` status. No UI yet — this sprint is API and service layer only.

## Context
After Sprint 1, the schema has `SourceDocument`, `IngestionJob`, `ExtractionRun`, `ProposedChangeSet`, and `FieldReview`. This sprint wires them together through a service layer and exposes API routes that the UI will call in Sprint 3.

The existing `packages/app/lib/pipeline/import-service.ts` handles mining-side imports. Do not modify it. The new intake service is separate.

---

## Task 1 — Validation service

Create `packages/app/lib/intake/validate.ts`:

```ts
import { z } from 'zod';

export const intakeSubmitSchema = z.object({
  sourceUrl: z.string().url(),
  sourceLabel: z.string().max(200).optional(),
  recordTypeOverride: z.string().max(50).optional(),
  notes: z.string().max(1000).optional()
});

export type IntakeSubmitInput = z.infer<typeof intakeSubmitSchema>;
```

---

## Task 2 — Fingerprint utility

Create `packages/app/lib/intake/fingerprint.ts`:

Implement `fingerprintUrl(url: string): string` that:
1. Parses the URL.
2. Lowercases scheme and host.
3. Removes default ports (80 for http, 443 for https).
4. Removes the hash fragment.
5. Returns a SHA-256 hex digest (first 32 chars) of the normalized URL string.

Use Node's built-in `node:crypto` — no external dependencies.

---

## Task 3 — Fetch service

Create `packages/app/lib/intake/fetch-source.ts`:

Implement `fetchSource(url: string): Promise<FetchResult>` where `FetchResult` is:

```ts
export interface FetchResult {
  finalUrl: string;
  httpStatus: number;
  contentType: string | null;
  rawHtml: string;
  extractedText: string;
  fetchedAt: Date;
  error?: string;
}
```

Rules:
- Follow up to 5 redirects manually (same approach as `packages/mining/src/workers/fetch.ts`).
- Set `User-Agent: ArtioAdminBot/1.0`.
- Cap response body at 5 MB — if `rawHtml.length > 5_000_000`, set `error: 'response_too_large'` and return a partial result with empty `rawHtml` and `extractedText`.
- `extractedText`: strip all HTML tags from `rawHtml` using a simple regex — no external HTML parser.
- Never throw — catch all errors and return them in the `error` field with the appropriate `httpStatus` (0 for network errors).

---

## Task 4 — Extraction stub

Create `packages/app/lib/intake/extract-fields.ts`:

Implement `extractFields(sourceDocument: { extractedText: string; sourceUrl: string }): Promise<ExtractionResult>` where:

```ts
export interface ExtractionResult {
  extractedFieldsJson: Record<string, unknown>;
  confidenceJson: Record<string, number>;
  evidenceJson: Record<string, string[]>;
  warningsJson: string[];
  modelVersion: string;
  parserVersion: string;
}
```

For now this is a **stub** that returns a plausible shape based on the source text, without calling any external AI API:

- `modelVersion`: `'stub-v0'`
- `parserVersion`: `'regex-v0'`
- Attempt to extract `title` by finding the first `<title>` tag content in the source URL's text, or use the URL hostname as fallback. Confidence: `0.4`.
- All other fields: empty with confidence `0`.
- `warningsJson`: `['extraction_stub_active — replace with real model in Sprint 5']`

The stub must implement the correct interface so Sprint 5 can swap in the real implementation without changing callers.

---

## Task 5 — Duplicate matching stub

Create `packages/app/lib/intake/match-canonical.ts`:

Implement `matchCanonical(prisma: PrismaClient, fingerprint: string): Promise<MatchResult>` where:

```ts
export interface MatchResult {
  matchedEventId: string | null;
  matchType: 'exact' | 'fuzzy' | 'none';
  diffJson: Record<string, unknown> | null;
}
```

For now:
- Do an exact match on `Event.sourceUrl` (normalized, lowercased) against the submitted URL.
- If a match is found return `{ matchedEventId: event.id, matchType: 'exact', diffJson: null }`.
- Otherwise return `{ matchedEventId: null, matchType: 'none', diffJson: null }`.

`diffJson` computation is deferred to Sprint 4.

---

## Task 6 — Intake orchestration service

Create `packages/app/lib/intake/intake-service.ts`:

Implement `runIntake(prisma: PrismaClient, input: IntakeSubmitInput, userId: string): Promise<IntakeRunResult>` where:

```ts
export interface IntakeRunResult {
  sourceDocumentId: string;
  ingestionJobId: string;
  proposedChangeSetId: string | null;
  finalStatus: IngestionJobStatus;
  error?: string;
}
```

The function must:

1. Create `SourceDocument` with `{ sourceUrl: input.sourceUrl, sourceType: input.recordTypeOverride ?? null }`.
2. Create `IngestionJob` with `{ sourceDocumentId, requestedByUserId: userId, status: 'queued', startedAt: new Date() }`.
3. Update `IngestionJob.status` → `'fetching'`. Call `fetchSource(input.sourceUrl)`.
4. Update `SourceDocument` with all fetch results. If `fetchResult.error` is set, set job status to `'failed'` with `errorCode: fetchResult.error` and return early.
5. Update `IngestionJob.status` → `'extracting'`. Compute fingerprint. Update `SourceDocument.fingerprint`.
6. Update `IngestionJob.status` → `'parsing'`. Call `extractFields`. Create `ExtractionRun`.
7. Update `IngestionJob.status` → `'matching'`. Call `matchCanonical`.
8. Create `ProposedChangeSet` with `{ sourceDocumentId, extractionRunId, matchedEventId, proposedDataJson: extractionResult.extractedFieldsJson, reviewStatus: 'draft' }`.
9. Update `IngestionJob.status` → `'needs_review'`, set `completedAt: new Date()`.
10. Return `{ sourceDocumentId, ingestionJobId, proposedChangeSetId, finalStatus: 'needs_review' }`.

All steps must update `IngestionJob.updatedAt` as they progress. Wrap the whole function in a try/catch — on any unhandled error, set job status to `'failed'` with the error message before rethrowing.

---

## Task 7 — POST `/api/admin/intake` route

Create `packages/app/app/api/admin/intake/route.ts`:

```ts
POST /api/admin/intake
Auth: requireRole(['operator', 'admin'])
Body: IntakeSubmitInput
Response 201: IntakeRunResult
Response 400: validation error
Response 401/403: auth failure
```

- Validate body with `intakeSubmitSchema`.
- Call `runIntake(prisma, parsed.data, session.user.id)`.
- Return `Response.json(result, { status: 201 })`.

---

## Task 8 — GET `/api/admin/intake` route (job list)

Add a `GET` handler to the same file:

```ts
GET /api/admin/intake?page=1&pageSize=20&status=needs_review
Auth: requireRole(['viewer', 'moderator', 'operator', 'admin'])
Response: paginated list of IngestionJob rows, each including sourceDocument { sourceUrl, fingerprint }
```

Use the existing `parsePagination` helper from `packages/app/lib/api/pagination.ts`. Support optional `status` query param filter.

---

## Task 9 — GET `/api/admin/intake/[id]` route (job detail)

Create `packages/app/app/api/admin/intake/[id]/route.ts`:

```ts
GET /api/admin/intake/[id]
Auth: requireRole(['viewer', 'moderator', 'operator', 'admin'])
Response: IngestionJob + sourceDocument + extractionRun (latest) + proposedChangeSet (latest)
Response 404: if job not found
```

---

## Task 10 — Unit tests

Create `packages/app/tests/intake-service.test.ts`.

Test the service layer (not the HTTP routes) by mocking `prisma`, `fetchSource`, `extractFields`, and `matchCanonical`.

Required test cases:
- Happy path: all steps succeed, final status is `needs_review`, `ProposedChangeSet` created.
- Fetch failure: `fetchSource` returns `error: 'fetch_failed'`, job ends with status `failed`, no `ExtractionRun` created.
- Fetch too large: `fetchSource` returns `error: 'response_too_large'`, same failure path.
- Duplicate match: `matchCanonical` returns a matched event ID, `ProposedChangeSet.matchedEventId` is set.

Create `packages/app/tests/intake-route.test.ts`.

Test the POST route:
- 401 when unauthenticated.
- 403 when role is `viewer` or `moderator`.
- 400 when URL is missing or malformed.
- 201 with correct response shape when operator submits a valid URL.

Follow the mock pattern in `packages/app/tests/admin-api-authz-regressions.test.ts` — mock `@/lib/db`, `@/lib/auth-guard`, and the intake service module.

---

## Acceptance criteria
- `npm run typecheck -w @artio/app` exits 0.
- `npm run test -w @artio/app` exits 0.
- `POST /api/admin/intake` with a valid URL creates `SourceDocument`, `IngestionJob`, `ExtractionRun`, and `ProposedChangeSet` records.
- `GET /api/admin/intake` returns a paginated list.
- `GET /api/admin/intake/[id]` returns the full job with nested records.
- A `viewer` or `moderator` cannot POST to the intake route.
- All new code passes the existing ESLint config.
