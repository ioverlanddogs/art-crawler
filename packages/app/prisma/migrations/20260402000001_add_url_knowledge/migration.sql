CREATE TABLE "UrlKnowledge" (
    "id" TEXT NOT NULL,
    "normalizedUrl" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "platformType" TEXT,
    "requiresJs" BOOLEAN NOT NULL DEFAULT false,
    "lastSuccessAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "bestExtractionMode" TEXT,
    "bestModelVersion" TEXT,
    "bestConfidenceScore" DOUBLE PRECISION,
    "replayStrategy" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UrlKnowledge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UrlKnowledge_normalizedUrl_key" ON "UrlKnowledge"("normalizedUrl");
CREATE INDEX "UrlKnowledge_domain_idx" ON "UrlKnowledge"("domain");
CREATE INDEX "UrlKnowledge_normalizedUrl_idx" ON "UrlKnowledge"("normalizedUrl");
