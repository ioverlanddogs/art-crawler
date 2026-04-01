import { prisma } from '../lib/db.js';
import { matureQueue } from '../queues.js';
import { enqueueNextStage } from '../lib/stage-chaining.js';

export async function runEnrich(candidateId: string, enqueueNext = true) {
  const c = await prisma.miningCandidate.findUniqueOrThrow({ where: { id: candidateId } });
  await prisma.pipelineTelemetry.create({ data: { sourceId: c.sourceId, stage: 'enrich', status: 'success', detail: 'MVP uses no external enrichers', candidateId, configVersion: c.configVersion } });
  if (enqueueNext) {
    await enqueueNextStage(matureQueue, 'mature', candidateId);
  }
}
