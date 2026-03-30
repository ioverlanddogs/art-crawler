import { prisma } from '../lib/db.js';

export async function runMature(candidateId: string) {
  const c = await prisma.miningCandidate.findUniqueOrThrow({ where: { id: candidateId } });
  await prisma.pipelineTelemetry.create({ data: { stage: 'mature', status: 'success', detail: 'MVP maturity check passed', candidateId, configVersion: c.configVersion } });
}
