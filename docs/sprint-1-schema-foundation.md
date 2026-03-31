# Sprint 1 — Schema foundation

## Goal
Add the six new domain models to the app Prisma schema that every subsequent sprint depends on. No application logic, no routes, no UI. Schema and generated client only.

## Context
The existing schema in `packages/app/prisma/schema.prisma` has `Event`, `Venue`, `IngestExtractedEvent`, `ImportBatch`, `IngestRun`, and `EnrichmentRun`. These remain untouched. The new models sit alongside them and represent the data-mastering layer: intake tracking, AI extraction output, human review, and publish control.

The `Event` model is treated as the canonical layer for now. `CanonicalRecord` is deferred to Phase 2 per the RC implementation recommendation. `Event` will receive `publishStatus` and `currentVersionId` in Sprint 4.

---

## Task 1 — Add enums

Add to `packages/app/prisma/schema.prisma`:

```prisma
enum IngestionJobStatus {
  queued
  fetching
  extracting
  parsing
  matching
  needs_review
  approved
  publishing
  published
  failed
}

enum ProposedChangeSetStatus {
  draft
  in_review
  approved
  rejected
  merged
}

enum FieldDecision {
  accepted
  edited
  rejected
  uncertain
}

enum PublishStatus {
  unpublished
  ready
  blocked
  published
  rolled_back
}
```

---

## Task 2 — Add `SourceDocument`

```prisma
model SourceDocument {
  id            String   @id @default(cuid())
  sourceUrl     String
  sourceType    String?
  fetchedAt     DateTime?
  httpStatus    Int?
  fingerprint   String?
  rawHtml       String?
  extractedText String?
  metadataJson  Json?
  mediaJson     Json?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  ingestionJobs  IngestionJob[]
  extractionRuns ExtractionRun[]

  @@index([fingerprint])
  @@index([createdAt(sort: Desc)])
}
```

---

## Task 3 — Add `IngestionJob`

```prisma
model IngestionJob {
  id                String             @id @default(cuid())
  sourceDocumentId  String
  requestedByUserId String?
  status            IngestionJobStatus @default(queued)
  startedAt         DateTime?
  completedAt       DateTime?
  errorCode         String?
  errorMessage      String?
  pipelineVersion   String?
  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt

  sourceDocument SourceDocument @relation(fields: [sourceDocumentId], references: [id], onDelete: Cascade)

  @@index([status, createdAt(sort: Desc)])
  @@index([sourceDocumentId])
}
```

---

## Task 4 — Add `ExtractionRun`

```prisma
model ExtractionRun {
  id                 String   @id @default(cuid())
  sourceDocumentId   String
  modelVersion       String?
  parserVersion      String?
  extractedFieldsJson Json?
  confidenceJson     Json?
  evidenceJson       Json?
  warningsJson       Json?
  createdAt          DateTime @default(now())

  sourceDocument    SourceDocument      @relation(fields: [sourceDocumentId], references: [id], onDelete: Cascade)
  proposedChangeSets ProposedChangeSet[]

  @@index([sourceDocumentId, createdAt(sort: Desc)])
}
```

---

## Task 5 — Add `ProposedChangeSet`

```prisma
model ProposedChangeSet {
  id                      String                  @id @default(cuid())
  sourceDocumentId        String
  extractionRunId         String?
  matchedEventId          String?
  proposedDataJson        Json?
  diffJson                Json?
  reviewStatus            ProposedChangeSetStatus @default(draft)
  reviewedByUserId        String?
  reviewedAt              DateTime?
  notes                   String?
  createdAt               DateTime                @default(now())
  updatedAt               DateTime                @updatedAt

  sourceDocument SourceDocument @relation(fields: [sourceDocumentId], references: [id], onDelete: Cascade)
  extractionRun  ExtractionRun? @relation(fields: [extractionRunId], references: [id])
  matchedEvent   Event?         @relation(fields: [matchedEventId], references: [id])
  fieldReviews   FieldReview[]

  @@index([reviewStatus, createdAt(sort: Desc)])
  @@index([sourceDocumentId])
}
```

Also add the back-relation to `Event`:

```prisma
// Inside model Event — add this field:
proposedChangeSets ProposedChangeSet[]
```

---

## Task 6 — Add `FieldReview`

```prisma
model FieldReview {
  id                  String        @id @default(cuid())
  proposedChangeSetId String
  fieldPath           String
  proposedValueJson   Json?
  canonicalValueJson  Json?
  confidence          Float?
  evidenceRefsJson    Json?
  decision            FieldDecision?
  reviewerId          String?
  reviewerComment     String?
  createdAt           DateTime      @default(now())
  updatedAt           DateTime      @updatedAt

  proposedChangeSet ProposedChangeSet @relation(fields: [proposedChangeSetId], references: [id], onDelete: Cascade)

  @@index([proposedChangeSetId])
  @@unique([proposedChangeSetId, fieldPath])
}
```

---

## Task 7 — Add `PublishBatch`

```prisma
model PublishBatch {
  id             String        @id @default(cuid())
  createdByUserId String?
  status         String        @default("pending")
  eventIdsJson   Json
  releaseSummary String?
  publishedAt    DateTime?
  createdAt      DateTime      @default(now())

  @@index([createdAt(sort: Desc)])
}
```

---

## Task 8 — Add `publishStatus` to `Event`

Add two fields to the existing `Event` model:

```prisma
// Inside model Event:
publishStatus PublishStatus @default(unpublished)
publishedAt   DateTime?
```

---

## Task 9 — Run generate and push

After all schema changes:

```bash
npm run prisma:generate -w @artio/app
npm run prisma:push -w @artio/app
```

Confirm no errors. Do not write any migrations — this project uses `db push`.

---

## Task 10 — Update the Prisma mock in tests

In `packages/app/tests/admin-api-authz-regressions.test.ts` and any other test file that defines a `prismaMock` object, add stub entries for the new models so the mock shape stays complete and existing tests continue to pass:

```ts
sourceDocument: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
ingestionJob: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
extractionRun: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
proposedChangeSet: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
fieldReview: { create: vi.fn(), upsert: vi.fn(), findMany: vi.fn() },
publishBatch: { create: vi.fn(), findMany: vi.fn() },
```

---

## Acceptance criteria
- `npm run prisma:generate -w @artio/app` exits 0.
- `npm run typecheck -w @artio/app` exits 0.
- `npm run test -w @artio/app` exits 0 — no existing tests broken.
- All six new models and four new enums are present in the generated Prisma client.
- No existing model is removed or renamed.
