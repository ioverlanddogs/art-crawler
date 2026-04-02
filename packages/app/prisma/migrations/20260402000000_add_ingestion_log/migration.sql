CREATE TABLE "IngestionLog" (
    "id" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "ingestionJobId" TEXT,
    "stage" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestionLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IngestionLog_sourceDocumentId_createdAt_idx"
  ON "IngestionLog"("sourceDocumentId", "createdAt" DESC);

CREATE INDEX "IngestionLog_ingestionJobId_createdAt_idx"
  ON "IngestionLog"("ingestionJobId", "createdAt" DESC);

CREATE INDEX "IngestionLog_stage_status_idx"
  ON "IngestionLog"("stage", "status");

ALTER TABLE "IngestionLog"
  ADD CONSTRAINT "IngestionLog_sourceDocumentId_fkey"
  FOREIGN KEY ("sourceDocumentId")
  REFERENCES "SourceDocument"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IngestionLog"
  ADD CONSTRAINT "IngestionLog_ingestionJobId_fkey"
  FOREIGN KEY ("ingestionJobId")
  REFERENCES "IngestionJob"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
