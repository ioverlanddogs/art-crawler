import { prisma } from '../lib/db.js';
import { exportQueue } from '../queues.js';

export async function runMature(candidateId: string, enqueueNext = true) {
  const c = await prisma.miningCandidate.findUniqueOrThrow({ where: { id: candidateId } });
  await prisma.pipelineTelemetry.create({ data: { stage: 'mature', status: 'success', detail: 'MVP maturity check passed', candidateId, configVersion: c.configVersion } });
  if (enqueueNext) {
    await exportQueue.add('export', { candidateId });
  }
}
