import { prisma } from '../lib/db.js';

export async function runEnrich(candidateId: string) {
  const c = await prisma.miningCandidate.findUniqueOrThrow({ where: { id: candidateId } });
  await prisma.pipelineTelemetry.create({ data: { stage: 'enrich', status: 'skip', detail: 'MVP uses no external enrichers', candidateId, configVersion: c.configVersion } });
}
