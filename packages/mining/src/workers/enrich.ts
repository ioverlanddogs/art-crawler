import { prisma } from '../lib/db.js';
import { matureQueue } from '../queues.js';

export async function runEnrich(candidateId: string, enqueueNext = true) {
  const c = await prisma.miningCandidate.findUniqueOrThrow({ where: { id: candidateId } });
  await prisma.pipelineTelemetry.create({ data: { stage: 'enrich', status: 'success', detail: 'MVP uses no external enrichers', candidateId, configVersion: c.configVersion } });
  if (enqueueNext) {
    await matureQueue.add('mature', { candidateId });
  }
}
