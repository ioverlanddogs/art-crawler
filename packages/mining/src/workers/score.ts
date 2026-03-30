import { prisma } from '../lib/db.js';
import { computeSignals } from '../lib/signals.js';
import { inferScore } from '../lib/model.js';
import { deduplicateQueue } from '../queues.js';
import { enqueueNextStage } from '../lib/stage-chaining.js';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export async function runScore(candidateId: string, enqueueNext = true) {
  const c = await prisma.miningCandidate.findUniqueOrThrow({ where: { id: candidateId }, include: { source: true } });
  const norm = asRecord(c.normalizedJson);
  const ext = asRecord(c.extractedJson);
  const extractionCompleteness = [ext.title ?? ext.name, ext.startDate ?? ext.startAt, ext.location ?? ext.venue]
    .filter(Boolean).length / 3;
  const signals = computeSignals({
    title: norm.title,
    sourceUrl: c.sourceUrl,
    platform: norm.platform ?? 'generic',
    trustTier: c.source?.trustTier,
    parserType: c.parserType,
    extractionCompleteness,
    sourceFailureCount: c.source?.failureCount
  });
  const score = inferScore(signals);
  await prisma.miningCandidate.update({ where: { id: candidateId }, data: { confidenceScore: score, status: 'SCORED' } });
  await prisma.pipelineTelemetry.create({ data: { stage: 'score', status: 'success', candidateId, configVersion: c.configVersion, detail: JSON.stringify(signals) } });
  if (enqueueNext) {
    await enqueueNextStage(deduplicateQueue, 'deduplicate', candidateId);
  }
}
