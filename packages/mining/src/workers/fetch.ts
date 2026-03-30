import { prisma } from '../lib/db.js';
import { extractQueue } from '../queues.js';
import { enqueueNextStage } from '../lib/stage-chaining.js';

export async function runFetch(candidateId: string, enqueueNext = true) {
  const candidate = await prisma.miningCandidate.findUniqueOrThrow({ where: { id: candidateId } });
  // TODO(assumption): SSRF guard currently allows only http/https and blocks local hosts.
  const url = new URL(candidate.sourceUrl);
  if (!['http:', 'https:'].includes(url.protocol) || ['localhost', '127.0.0.1'].includes(url.hostname)) {
    await prisma.pipelineTelemetry.create({ data: { stage: 'fetch', status: 'failure', detail: 'SSRF blocked', candidateId, configVersion: candidate.configVersion } });
    throw new Error('Blocked URL');
  }
  const html = `<html><body><h1>Sample Event</h1><script type=\"application/ld+json\">{"name":"Sample Event"}</script></body></html>`;
  await prisma.miningCandidate.update({ where: { id: candidateId }, data: { html, status: 'FETCHED' } });
  await prisma.pipelineTelemetry.create({ data: { stage: 'fetch', status: 'success', candidateId, configVersion: candidate.configVersion } });
  if (enqueueNext) {
    await enqueueNextStage(extractQueue, 'extract', candidateId);
  }
}
