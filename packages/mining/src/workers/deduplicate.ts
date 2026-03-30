import { prisma } from '../lib/db.js';
import { clusterId } from '../lib/dedup.js';
import { enrichQueue } from '../queues.js';
import { enqueueNextStage } from '../lib/stage-chaining.js';

export async function runDeduplicate(candidateId: string, enqueueNext = true) {
  const c = await prisma.miningCandidate.findUniqueOrThrow({ where: { id: candidateId } });
  if (!c.fingerprint) {
    await prisma.pipelineTelemetry.create({ data: { stage: 'deduplicate', status: 'skip', candidateId, configVersion: c.configVersion, detail: 'missing fingerprint' } });
    return;
  }
  await prisma.miningCandidate.update({ where: { id: candidateId }, data: { dedupClusterId: clusterId(c.fingerprint), status: 'DEDUPED' } });
  await prisma.pipelineTelemetry.create({ data: { stage: 'deduplicate', status: 'success', candidateId, configVersion: c.configVersion } });
  if (enqueueNext) {
    await enqueueNextStage(enrichQueue, 'enrich', candidateId);
  }
}
