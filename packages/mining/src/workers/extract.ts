import { prisma } from '../lib/db.js';
import { normaliseQueue } from '../queues.js';
import { enqueueNextStage } from '../lib/stage-chaining.js';

export interface AiExtractor {
  extract(text: string): Promise<Record<string, unknown>>;
}

export const mockAiExtractor: AiExtractor = {
  async extract() {
    return { title: 'Sample Event', platform: 'generic' };
  }
};

export async function runExtract(candidateId: string, ai: AiExtractor = mockAiExtractor, enqueueNext = true) {
  const candidate = await prisma.miningCandidate.findUniqueOrThrow({ where: { id: candidateId } });
  const ldJsonMatch = candidate.html?.match(/\{\"name\":\"([^\"]+)\"\}/);
  const extracted = ldJsonMatch ? { title: ldJsonMatch[1], platform: 'generic' } : await ai.extract(candidate.html ?? '');
  await prisma.miningCandidate.update({ where: { id: candidateId }, data: { extractedJson: extracted, status: 'EXTRACTED' } });
  await prisma.pipelineTelemetry.create({ data: { stage: 'extract', status: 'success', candidateId, configVersion: candidate.configVersion } });
  if (enqueueNext) {
    await enqueueNextStage(normaliseQueue, 'normalise', candidateId);
  }
}
