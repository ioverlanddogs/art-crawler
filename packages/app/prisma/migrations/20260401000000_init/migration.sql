-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('viewer', 'moderator', 'operator', 'admin');

-- CreateEnum
CREATE TYPE "AdminUserStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PipelineConfigStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ModelVersionStatus" AS ENUM ('SHADOW', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ConfidenceBand" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "IngestExtractedStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'DUPLICATE');

-- CreateEnum
CREATE TYPE "DiscoveryStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DiscoveryTemplateSource" AS ENUM ('manual', 'ai_suggested');

-- CreateEnum
CREATE TYPE "DiscoveryTemplateStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CONVERGED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DiscoverySuggestionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EnrichmentRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCESS', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "IngestionJobStatus" AS ENUM ('queued', 'fetching', 'extracting', 'parsing', 'matching', 'needs_review', 'approved', 'publishing', 'published', 'failed');

-- CreateEnum
CREATE TYPE "ProposedChangeSetStatus" AS ENUM ('draft', 'in_review', 'approved', 'rejected', 'merged');

-- CreateEnum
CREATE TYPE "FieldDecision" AS ENUM ('accepted', 'edited', 'rejected', 'uncertain');

-- CreateEnum
CREATE TYPE "PublishStatus" AS ENUM ('unpublished', 'ready', 'blocked', 'published', 'rolled_back');

-- CreateEnum
CREATE TYPE "DuplicateResolutionStatus" AS ENUM ('unresolved', 'resolved_merge', 'resolved_separate', 'false_positive', 'escalated');

-- CreateEnum
CREATE TYPE "AssignmentSlaState" AS ENUM ('unassigned', 'assigned', 'in_progress', 'overdue', 'escalated');

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "AdminRole" NOT NULL DEFAULT 'viewer',
    "status" "AdminUserStatus" NOT NULL DEFAULT 'PENDING',
    "passwordHash" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminInvite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineConfigVersion" (
    "id" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "PipelineConfigStatus" NOT NULL DEFAULT 'DRAFT',
    "configJson" JSONB NOT NULL,
    "changeReason" TEXT,
    "activatedAt" TIMESTAMP(3),
    "activatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "PipelineConfigVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelVersion" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "coefficients" JSONB NOT NULL,
    "intercept" DOUBLE PRECISION NOT NULL,
    "status" "ModelVersionStatus" NOT NULL DEFAULT 'SHADOW',
    "promotedAt" TIMESTAMP(3),
    "promotedBy" TEXT,
    "shadowMetrics" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "domain" TEXT,
    "timezone" TEXT,
    "region" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Artist" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "bio" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Artist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Artwork" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT,
    "description" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Artwork_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "venueId" TEXT,
    "title" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "timezone" TEXT,
    "location" TEXT,
    "description" TEXT,
    "sourceUrl" TEXT,
    "publishStatus" "PublishStatus" NOT NULL DEFAULT 'unpublished',
    "assignedReviewerId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "escalationLevel" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3),
    "slaState" "AssignmentSlaState" NOT NULL DEFAULT 'unassigned',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceDocument" (
    "id" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceType" TEXT,
    "fetchedAt" TIMESTAMP(3),
    "httpStatus" INTEGER,
    "fingerprint" TEXT,
    "rawHtml" TEXT,
    "extractedText" TEXT,
    "metadataJson" JSONB,
    "mediaJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionJob" (
    "id" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "requestedByUserId" TEXT,
    "status" "IngestionJobStatus" NOT NULL DEFAULT 'queued',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "pipelineVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractionRun" (
    "id" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "modelVersion" TEXT,
    "parserVersion" TEXT,
    "extractedFieldsJson" JSONB,
    "confidenceJson" JSONB,
    "evidenceJson" JSONB,
    "warningsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtractionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposedChangeSet" (
    "id" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "extractionRunId" TEXT,
    "matchedEventId" TEXT,
    "proposedDataJson" JSONB,
    "diffJson" JSONB,
    "reviewStatus" "ProposedChangeSetStatus" NOT NULL DEFAULT 'draft',
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "notes" TEXT,
    "assignedReviewerId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "escalationLevel" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3),
    "slaState" "AssignmentSlaState" NOT NULL DEFAULT 'unassigned',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposedChangeSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuplicateCandidate" (
    "id" TEXT NOT NULL,
    "proposedChangeSetId" TEXT NOT NULL,
    "canonicalEventId" TEXT,
    "recordType" TEXT NOT NULL DEFAULT 'Event',
    "source" TEXT,
    "matchConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "corroborationSourceCount" INTEGER NOT NULL DEFAULT 0,
    "corroborationConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "conflictingSourceCount" INTEGER NOT NULL DEFAULT 0,
    "unresolvedBlockerCount" INTEGER NOT NULL DEFAULT 0,
    "fieldCorroborationJson" JSONB,
    "confidenceExplanation" TEXT,
    "duplicateRiskExplanation" TEXT,
    "reviewerNote" TEXT,
    "assignedReviewerId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "escalationLevel" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3),
    "slaState" "AssignmentSlaState" NOT NULL DEFAULT 'unassigned',
    "resolutionStatus" "DuplicateResolutionStatus" NOT NULL DEFAULT 'unresolved',
    "resolvedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DuplicateCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldReview" (
    "id" TEXT NOT NULL,
    "proposedChangeSetId" TEXT NOT NULL,
    "fieldPath" TEXT NOT NULL,
    "proposedValueJson" JSONB,
    "canonicalValueJson" JSONB,
    "confidence" DOUBLE PRECISION,
    "evidenceRefsJson" JSONB,
    "decision" "FieldDecision",
    "reviewerId" TEXT,
    "reviewerComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishBatch" (
    "id" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "eventIdsJson" JSONB NOT NULL,
    "releaseSummary" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublishBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanonicalRecordVersion" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "dataJson" JSONB NOT NULL,
    "changeSummary" TEXT,
    "sourceDocumentId" TEXT,
    "proposedChangeSetId" TEXT,
    "publishBatchId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CanonicalRecordVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestExtractedEvent" (
    "id" TEXT NOT NULL,
    "region" TEXT,
    "configVersion" INTEGER,
    "venueId" TEXT,
    "title" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "timezone" TEXT,
    "locationText" TEXT,
    "description" TEXT,
    "artistNames" TEXT[],
    "imageUrl" TEXT,
    "sourceUrl" TEXT,
    "confidenceScore" INTEGER NOT NULL,
    "confidenceBand" "ConfidenceBand" NOT NULL,
    "confidenceReasons" JSONB,
    "fingerprint" TEXT NOT NULL,
    "clusterKey" TEXT,
    "duplicateOfId" TEXT,
    "source" TEXT NOT NULL,
    "status" "IngestExtractedStatus" NOT NULL DEFAULT 'PENDING',
    "moderatedBy" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "autoApproved" BOOLEAN NOT NULL DEFAULT false,
    "autoApprovedAt" TIMESTAMP(3),
    "miningConfidenceScore" INTEGER,
    "miningObservationCount" INTEGER,
    "miningCrossSourceCount" INTEGER,
    "importBatchId" TEXT,
    "artioEventId" TEXT,
    "ingestRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestExtractedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestExtractedArtist" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "confidenceScore" INTEGER NOT NULL,
    "confidenceBand" "ConfidenceBand" NOT NULL,
    "confidenceReasons" JSONB,
    "fingerprint" TEXT NOT NULL,
    "clusterKey" TEXT,
    "duplicateOfId" TEXT,
    "source" TEXT NOT NULL,
    "status" "IngestExtractedStatus" NOT NULL DEFAULT 'PENDING',
    "moderatedBy" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "autoApproved" BOOLEAN NOT NULL DEFAULT false,
    "autoApprovedAt" TIMESTAMP(3),
    "importBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestExtractedArtist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestExtractedArtwork" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artistName" TEXT,
    "sourceUrl" TEXT,
    "confidenceScore" INTEGER NOT NULL,
    "confidenceBand" "ConfidenceBand" NOT NULL,
    "confidenceReasons" JSONB,
    "fingerprint" TEXT NOT NULL,
    "clusterKey" TEXT,
    "duplicateOfId" TEXT,
    "source" TEXT NOT NULL,
    "status" "IngestExtractedStatus" NOT NULL DEFAULT 'PENDING',
    "moderatedBy" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "autoApproved" BOOLEAN NOT NULL DEFAULT false,
    "autoApprovedAt" TIMESTAMP(3),
    "importBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestExtractedArtwork_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "externalBatchId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "feedbackReceivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestRun" (
    "id" TEXT NOT NULL,
    "venueId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "fetchStatusCode" INTEGER,
    "extractMethod" TEXT,
    "tokenCostUsd" DOUBLE PRECISION,
    "provider" TEXT,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineTelemetry" (
    "id" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "detail" TEXT,
    "configVersion" INTEGER,
    "entityId" TEXT,
    "entityType" TEXT,
    "pipelineRunId" TEXT,
    "durationMs" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PipelineTelemetry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VenueProfile" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "name" TEXT,
    "eventsPageUrl" TEXT,
    "region" TEXT NOT NULL,
    "platformType" TEXT,
    "requiresJs" BOOLEAN NOT NULL DEFAULT false,
    "ingestFrequency" TEXT,
    "lastCrawledAt" TIMESTAMP(3),
    "candidateYield" INTEGER NOT NULL DEFAULT 0,
    "approvalRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "DiscoveryStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VenueProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoveryTemplate" (
    "id" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "source" "DiscoveryTemplateSource" NOT NULL,
    "status" "DiscoveryTemplateStatus" NOT NULL DEFAULT 'ACTIVE',
    "alpha" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "beta" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "totalJobs" INTEGER NOT NULL DEFAULT 0,
    "lastYieldAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscoveryTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoveryGoal" (
    "id" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "target" INTEGER NOT NULL,
    "deadline" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscoveryGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoverySuggestion" (
    "id" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "reason" TEXT,
    "status" "DiscoverySuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscoverySuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrichmentRun" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "status" "EnrichmentRunStatus" NOT NULL,
    "fieldsChanged" TEXT[],
    "confidenceBefore" INTEGER,
    "confidenceAfter" INTEGER,
    "sourceUrl" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnrichmentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AdminInvite_tokenHash_key" ON "AdminInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "PipelineConfigVersion_region_status_idx" ON "PipelineConfigVersion"("region", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineConfigVersion_region_version_key" ON "PipelineConfigVersion"("region", "version");

-- CreateIndex
CREATE INDEX "ModelVersion_entityType_status_idx" ON "ModelVersion"("entityType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Venue_slug_key" ON "Venue"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Venue_domain_key" ON "Venue"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "Artist_slug_key" ON "Artist"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Artwork_slug_key" ON "Artwork"("slug");

-- CreateIndex
CREATE INDEX "SourceDocument_fingerprint_idx" ON "SourceDocument"("fingerprint");

-- CreateIndex
CREATE INDEX "SourceDocument_createdAt_idx" ON "SourceDocument"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "IngestionJob_status_createdAt_idx" ON "IngestionJob"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "IngestionJob_sourceDocumentId_idx" ON "IngestionJob"("sourceDocumentId");

-- CreateIndex
CREATE INDEX "ExtractionRun_sourceDocumentId_createdAt_idx" ON "ExtractionRun"("sourceDocumentId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ProposedChangeSet_reviewStatus_createdAt_idx" ON "ProposedChangeSet"("reviewStatus", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ProposedChangeSet_sourceDocumentId_idx" ON "ProposedChangeSet"("sourceDocumentId");

-- CreateIndex
CREATE INDEX "DuplicateCandidate_resolutionStatus_updatedAt_idx" ON "DuplicateCandidate"("resolutionStatus", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "DuplicateCandidate_proposedChangeSetId_resolutionStatus_idx" ON "DuplicateCandidate"("proposedChangeSetId", "resolutionStatus");

-- CreateIndex
CREATE INDEX "DuplicateCandidate_canonicalEventId_idx" ON "DuplicateCandidate"("canonicalEventId");

-- CreateIndex
CREATE INDEX "FieldReview_proposedChangeSetId_idx" ON "FieldReview"("proposedChangeSetId");

-- CreateIndex
CREATE UNIQUE INDEX "FieldReview_proposedChangeSetId_fieldPath_key" ON "FieldReview"("proposedChangeSetId", "fieldPath");

-- CreateIndex
CREATE INDEX "PublishBatch_createdAt_idx" ON "PublishBatch"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "CanonicalRecordVersion_eventId_createdAt_idx" ON "CanonicalRecordVersion"("eventId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "CanonicalRecordVersion_eventId_versionNumber_key" ON "CanonicalRecordVersion"("eventId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "IngestExtractedEvent_fingerprint_key" ON "IngestExtractedEvent"("fingerprint");

-- CreateIndex
CREATE INDEX "IngestExtractedEvent_fingerprint_idx" ON "IngestExtractedEvent"("fingerprint");

-- CreateIndex
CREATE INDEX "IngestExtractedEvent_region_status_idx" ON "IngestExtractedEvent"("region", "status");

-- CreateIndex
CREATE INDEX "IngestExtractedEvent_clusterKey_idx" ON "IngestExtractedEvent"("clusterKey");

-- CreateIndex
CREATE INDEX "IngestExtractedEvent_confidenceBand_status_createdAt_idx" ON "IngestExtractedEvent"("confidenceBand", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "IngestExtractedEvent_importBatchId_idx" ON "IngestExtractedEvent"("importBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "IngestExtractedArtist_fingerprint_key" ON "IngestExtractedArtist"("fingerprint");

-- CreateIndex
CREATE INDEX "IngestExtractedArtist_fingerprint_idx" ON "IngestExtractedArtist"("fingerprint");

-- CreateIndex
CREATE INDEX "IngestExtractedArtist_status_createdAt_idx" ON "IngestExtractedArtist"("status", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "IngestExtractedArtwork_fingerprint_key" ON "IngestExtractedArtwork"("fingerprint");

-- CreateIndex
CREATE INDEX "IngestExtractedArtwork_fingerprint_idx" ON "IngestExtractedArtwork"("fingerprint");

-- CreateIndex
CREATE INDEX "IngestExtractedArtwork_status_createdAt_idx" ON "IngestExtractedArtwork"("status", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_externalBatchId_key" ON "ImportBatch"("externalBatchId");

-- CreateIndex
CREATE INDEX "ImportBatch_region_createdAt_idx" ON "ImportBatch"("region", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "IngestRun_createdAt_idx" ON "IngestRun"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "PipelineTelemetry_stage_createdAt_idx" ON "PipelineTelemetry"("stage", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PipelineTelemetry_pipelineRunId_createdAt_idx" ON "PipelineTelemetry"("pipelineRunId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VenueProfile_domain_key" ON "VenueProfile"("domain");

-- CreateIndex
CREATE INDEX "DiscoveryTemplate_region_status_idx" ON "DiscoveryTemplate"("region", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DiscoveryGoal_region_key" ON "DiscoveryGoal"("region");

-- CreateIndex
CREATE INDEX "DiscoverySuggestion_region_status_idx" ON "DiscoverySuggestion"("region", "status");

-- CreateIndex
CREATE INDEX "EnrichmentRun_entityType_entityId_createdAt_idx" ON "EnrichmentRun"("entityType", "entityId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- AddForeignKey
ALTER TABLE "AdminUser" ADD CONSTRAINT "AdminUser_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminInvite" ADD CONSTRAINT "AdminInvite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionJob" ADD CONSTRAINT "IngestionJob_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionRun" ADD CONSTRAINT "ExtractionRun_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposedChangeSet" ADD CONSTRAINT "ProposedChangeSet_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposedChangeSet" ADD CONSTRAINT "ProposedChangeSet_extractionRunId_fkey" FOREIGN KEY ("extractionRunId") REFERENCES "ExtractionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposedChangeSet" ADD CONSTRAINT "ProposedChangeSet_matchedEventId_fkey" FOREIGN KEY ("matchedEventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateCandidate" ADD CONSTRAINT "DuplicateCandidate_proposedChangeSetId_fkey" FOREIGN KEY ("proposedChangeSetId") REFERENCES "ProposedChangeSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateCandidate" ADD CONSTRAINT "DuplicateCandidate_canonicalEventId_fkey" FOREIGN KEY ("canonicalEventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldReview" ADD CONSTRAINT "FieldReview_proposedChangeSetId_fkey" FOREIGN KEY ("proposedChangeSetId") REFERENCES "ProposedChangeSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanonicalRecordVersion" ADD CONSTRAINT "CanonicalRecordVersion_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestExtractedEvent" ADD CONSTRAINT "IngestExtractedEvent_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestExtractedEvent" ADD CONSTRAINT "IngestExtractedEvent_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestExtractedEvent" ADD CONSTRAINT "IngestExtractedEvent_ingestRunId_fkey" FOREIGN KEY ("ingestRunId") REFERENCES "IngestRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestExtractedEvent" ADD CONSTRAINT "IngestExtractedEvent_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "IngestExtractedEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestRun" ADD CONSTRAINT "IngestRun_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

