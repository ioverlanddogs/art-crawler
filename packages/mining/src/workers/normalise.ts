import { prisma } from '../lib/db.js';
import { fingerprint } from '../lib/dedup.js';
import { scoreQueue } from '../queues.js';
import { enqueueNextStage } from '../lib/stage-chaining.js';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export async function runNormalise(candidateId: string, enqueueNext = true) {
  const c = await prisma.miningCandidate.findUniqueOrThrow({ where: { id: candidateId } });
  const ext = asRecord(c.extractedJson);
  const title = (ext.title ?? 'Untitled').toString().trim();
  const fp = fingerprint(title, c.sourceUrl);
  await prisma.miningCandidate.update({ where: { id: candidateId }, data: { normalizedJson: { title, platform: ext.platform ?? 'generic' }, fingerprint: fp, status: 'NORMALISED' } });
  await prisma.pipelineTelemetry.create({ data: { stage: 'normalise', status: 'success', candidateId, configVersion: c.configVersion } });
  if (enqueueNext) {
    await enqueueNextStage(scoreQueue, 'score', candidateId);
  }
}
