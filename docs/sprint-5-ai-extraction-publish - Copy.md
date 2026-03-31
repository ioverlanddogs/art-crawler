# Sprint 5 — AI extraction and publish queue

## Goal
Replace the extraction stub with a real AI-backed field extraction call. Build the publish queue page and the publish action. Add the data health widgets to the dashboard.

## Context
After Sprint 4 the full review workflow works end-to-end with stub extraction. This sprint makes extraction real and closes the loop with publishing.

The extraction service in `packages/app/lib/intake/extract-fields.ts` currently returns stub data. It must be replaced without changing its interface — callers in `intake-service.ts` must not require modification.

---

## Task 1 — AI extraction service (real implementation)

Replace the body of `packages/app/lib/intake/extract-fields.ts` with a real implementation.

The function signature stays identical:
```ts
extractFields(sourceDocument: { extractedText: string; sourceUrl: string }): Promise<ExtractionResult>
```

Implementation:
- Call the Anthropic API using `fetch` directly (no SDK — the app has no Anthropic SDK dependency yet).
- Endpoint: `https://api.anthropic.com/v1/messages`
- Model: `claude-haiku-4-5-20251001` (fast, low cost for extraction).
- Auth: `x-api-key` header from env var `ANTHROPIC_API_KEY`. If the env var is absent, fall back to the stub and include `'anthropic_api_key_missing'` in `warningsJson`.
- `max_tokens`: 1024.

System prompt:
```
You are a structured data extraction assistant for an arts and culture events platform.
Extract event data from the provided page text and return ONLY a JSON object with no preamble or markdown.
```

User prompt — build from the source text (truncate `extractedText` to 4000 characters):
```
Extract structured event data from this page.

Source URL: {sourceUrl}
Page text:
{extractedText}

Return a JSON object with these fields (omit fields you cannot find):
{
  "title": "string — event or exhibition title",
  "startAt": "ISO 8601 datetime or date",
  "endAt": "ISO 8601 datetime or date (if applicable)",
  "timezone": "IANA timezone name if found",
  "locationText": "venue name and/or address",
  "description": "brief event description (max 300 chars)",
  "artistNames": ["array of artist or performer names"],
  "imageUrl": "URL of a representative image if found in the text"
}

For each field you return, also return a confidence object:
{
  "confidence": {
    "title": 0.0-1.0,
    ...
  }
}

And an evidence object with the sentence or phrase that supports each field:
{
  "evidence": {
    "title": "the supporting text snippet",
    ...
  }
}
```

Parse the response:
- Strip any markdown code fences before `JSON.parse`.
- Extract `extractedFieldsJson`, `confidenceJson`, and `evidenceJson` from the parsed response.
- If parsing fails: fall back to stub result and add `'ai_parse_error'` to `warningsJson`.
- Set `modelVersion: 'claude-haiku-4-5-20251001'`, `parserVersion: 'prompt-v1'`.

Add `ANTHROPIC_API_KEY` to `packages/app/.env.example` with the value `your_anthropic_api_key_here`.

---

## Task 2 — Extraction cost tracking

After a successful API call, log token usage to `PipelineTelemetry`:

```ts
await prisma.pipelineTelemetry.create({
  data: {
    stage: 'ai_extraction',
    status: 'success',
    entityId: sourceDocumentId,
    entityType: 'SourceDocument',
    metadata: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      model: 'claude-haiku-4-5-20251001'
    }
  }
});
```

On failure, log `status: 'failure'` with the error message in `metadata`.

---

## Task 3 — Publish queue API routes

Create `packages/app/app/api/admin/publish/route.ts`:

```ts
GET /api/admin/publish?page=1&pageSize=20
Auth: requireRole(['viewer', 'moderator', 'operator', 'admin'])
Response: paginated list of Event records where publishStatus = 'ready',
          each including the latest ProposedChangeSet (reviewer, reviewedAt)
```

Create `packages/app/app/api/admin/publish/[eventId]/route.ts`:

```ts
POST /api/admin/publish/[eventId]
Auth: requireRole(['operator', 'admin'])
Body: { releaseSummary?: string }
Response 200: { publishBatchId: string; eventId: string }
Response 409: { blockers: string[] } if publish gate fails
Response 404: event not found
Response 400: event not in 'ready' status
```

On POST:
1. Load the `Event`. Return 404/400 as appropriate.
2. Load the latest `ProposedChangeSet` for this event's source. Run `checkPublishReadiness` on it. Return 409 if not ready.
3. Create a `PublishBatch` with `{ eventIdsJson: [eventId], releaseSummary, createdByUserId: session.user.id, status: 'published', publishedAt: new Date() }`.
4. Update `Event.publishStatus = 'published'`, `Event.publishedAt = new Date()`.
5. Update `IngestionJob.status = 'published'` (via sourceDocumentId chain).
6. Return `{ publishBatchId, eventId }`.

---

## Task 4 — Publish queue page

Create `packages/app/app/(admin)/publish/page.tsx` as a server component.

Layout:
- `PageHeader` title "Publish queue" description "Records approved and ready for public release."
- A `SectionCard` "Ready to publish" containing a table:
  - Columns: Title, Change type (created/updated), Reviewer, Ready since, Actions.
  - Actions: "Publish" button per row (links to publish detail, handled client-side).
- A `SectionCard` "Recently published" showing the 10 most recent `PublishBatch` entries.
- Show `EmptyState` if no events are ready.

Create `packages/app/app/(admin)/publish/[eventId]/page.tsx` as a server component.

This is the publish confirmation page:
- Show event title, all fields that changed (from the `ProposedChangeSet.diffJson`), evidence coverage count, and any risk warnings from `checkPublishReadiness`.
- A `ConfirmPublishPanel` client component that handles the POST to the publish route and redirects back to `/publish` on success with a toast.

---

## Task 5 — Add publish to admin nav

In `packages/app/app/(admin)/layout.tsx`, add a nav item for "Publish" pointing to `/publish`. Place it after "Review Queue" in nav order.

---

## Task 6 — Data health dashboard widgets

Update `packages/app/app/(admin)/dashboard/page.tsx`.

Add a new "Data health" `SectionCard` below the existing failure hotspots card. Add the following Prisma queries to the existing `Promise.all`:

```ts
// Fields with evidence coverage (extraction runs with non-empty evidenceJson)
safeQuery(() => prisma.extractionRun.count({ where: { evidenceJson: { not: null } } }), 0),

// Total extraction runs
safeQuery(() => prisma.extractionRun.count(), 0),

// Events ready to publish
safeQuery(() => prisma.event.count({ where: { publishStatus: 'ready' } }), 0),

// Events published this week
safeQuery(() => prisma.event.count({ where: { publishStatus: 'published', publishedAt: { gte: since7d } } }), 0),
```

Display as four stat items in the Data Health card:
- "Extractions with evidence": `count / total * 100`% (or "No extractions yet").
- "Events ready to publish": count, link to `/publish`.
- "Published this week": count.
- "AI extraction active": "Yes" if `ANTHROPIC_API_KEY` is set, "Stub mode" if not.

---

## Task 7 — Environment variable validation

In `packages/app/lib/env.ts`, add:

```ts
export function getAnthropicApiKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY;
}

export function isAiExtractionEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}
```

---

## Task 8 — Unit tests

Create `packages/app/tests/extract-fields.test.ts`.

Test:
- When `ANTHROPIC_API_KEY` is not set, falls back to stub and includes `'anthropic_api_key_missing'` in warnings.
- When the API returns valid JSON, `extractedFieldsJson`, `confidenceJson`, `evidenceJson` are correctly parsed.
- When the API returns malformed JSON, falls back to stub and includes `'ai_parse_error'` in warnings.
- When the API returns a non-200 status, falls back to stub.

Mock `fetch` globally — do not make real HTTP calls in tests.

Create `packages/app/tests/publish-routes.test.ts`.

Test:
- `GET /api/admin/publish`: returns only `ready` events, respects pagination.
- `POST /api/admin/publish/[eventId]`: 404 for unknown event, 400 for non-ready event, 409 when publish gate fails, 200 creates `PublishBatch` and updates event status.

---

## Acceptance criteria
- `npm run typecheck -w @artio/app` exits 0.
- `npm run test -w @artio/app` exits 0.
- When `ANTHROPIC_API_KEY` is set and valid, submitting a URL produces populated `extractedFieldsJson` with confidence scores from the real API.
- When `ANTHROPIC_API_KEY` is absent, extraction still completes using the stub — no crash.
- The publish queue page shows all `ready` events.
- Publishing an event sets `publishStatus: 'published'` and creates a `PublishBatch` record.
- The data health section on the dashboard shows evidence coverage and publish counts.
- All existing tests continue to pass.
