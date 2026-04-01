ALTER TABLE "TrustedSource"
ADD COLUMN "reliabilityCounters" JSONB NOT NULL DEFAULT '{}';
