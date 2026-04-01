ALTER TABLE "PipelineTelemetry"
ADD COLUMN "sourceId" TEXT;

CREATE INDEX "PipelineTelemetry_sourceId_stage_status_idx"
ON "PipelineTelemetry"("sourceId", "stage", "status");
