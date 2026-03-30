import { prisma } from '../lib/db.js';
import { computeSignals } from '../lib/signals.js';
import { inferScore } from '../lib/model.js';
import { deduplicateQueue } from '../queues.js';

export async function runScore(candidateId: string, enqueueNext = true) {
  const c = await prisma.miningCandidate.findUniqueOrThrow({ where: { id: candidateId } });
  const norm = (c.normalizedJson as any) ?? {};
  const signals = computeSignals({ title: norm.title, sourceUrl: c.sourceUrl, platform: norm.platform ?? 'generic' });
  const score = inferScore(signals);
  await prisma.miningCandidate.update({ where: { id: candidateId }, data: { confidenceScore: score, status: 'SCORED' } });
  await prisma.pipelineTelemetry.create({ data: { stage: 'score', status: 'success', candidateId, configVersion: c.configVersion, detail: JSON.stringify(signals) } });
  if (enqueueNext) {
    await deduplicateQueue.add('deduplicate', { candidateId });
  }
}
