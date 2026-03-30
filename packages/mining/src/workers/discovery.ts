import { prisma } from '../lib/db.js';
import { loadActiveConfig } from '../lib/config.js';

export async function runDiscovery() {
  const cfg = await loadActiveConfig();
  const candidate = await prisma.miningCandidate.create({
    data: {
      sourceUrl: 'https://example.com/events/1',
      status: 'DISCOVERED',
      configVersion: cfg.version
    }
  });
  await prisma.pipelineTelemetry.create({ data: { stage: 'discovery', status: 'success', candidateId: candidate.id, configVersion: cfg.version } });
  return candidate;
}
