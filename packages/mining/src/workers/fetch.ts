import { prisma } from '../lib/db.js';
import { extractQueue } from '../queues.js';
import { enqueueNextStage } from '../lib/stage-chaining.js';
import { createHash } from 'node:crypto';
import { markSourceFailure, markSourceSuccess } from '../lib/source-health.js';

function matchesPathRules(pathname: string, allowed: string[], blocked: string[]) {
  const allowMatch = allowed.length === 0 || allowed.some((pattern) => pathname.includes(pattern));
  const blockedMatch = blocked.some((pattern) => pathname.includes(pattern));
  return allowMatch && !blockedMatch;
}

export async function runFetch(candidateId: string, enqueueNext = true) {
  const candidate = await prisma.miningCandidate.findUniqueOrThrow({
    where: { id: candidateId },
    include: { source: true }
  });
  if (!candidate.sourceId || !candidate.source) {
    await prisma.pipelineTelemetry.create({ data: { stage: 'fetch', status: 'failure', detail: 'missing trusted source relation', candidateId, configVersion: candidate.configVersion } });
    throw new Error('Missing trusted source relation');
  }

  // TODO(assumption): SSRF guard currently allows only http/https and blocks local hosts.
  const url = new URL(candidate.sourceUrl);
  if (!['http:', 'https:'].includes(url.protocol) || ['localhost', '127.0.0.1'].includes(url.hostname)) {
    await markSourceFailure(candidate.sourceId, 'ssrf_blocked');
    await prisma.pipelineTelemetry.create({ data: { stage: 'fetch', status: 'failure', detail: 'SSRF blocked', candidateId, configVersion: candidate.configVersion } });
    throw new Error('Blocked URL');
  }

  if (url.hostname !== candidate.source.domain || !matchesPathRules(url.pathname, candidate.source.allowedPathPatterns, candidate.source.blockedPathPatterns)) {
    await markSourceFailure(candidate.sourceId, 'url_not_approved_for_source');
    await prisma.pipelineTelemetry.create({ data: { stage: 'fetch', status: 'failure', detail: 'URL not approved by source policy', candidateId, configVersion: candidate.configVersion } });
    throw new Error('URL is not approved by trusted source policy');
  }

  let response: Response;
  try {
    response = await fetch(candidate.sourceUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'user-agent': 'ArtioMiningBot/1.0 (+https://artio.local/mining)'
      }
    });
  } catch (error: any) {
    await markSourceFailure(candidate.sourceId, `fetch_exception:${error.message}`);
    await prisma.miningCandidate.update({
      where: { id: candidateId },
      data: {
        retryCount: { increment: 1 },
        lastError: `fetch_exception:${error.message}`
      }
    });
    await prisma.pipelineTelemetry.create({ data: { stage: 'fetch', status: 'failure', detail: JSON.stringify({ sourceId: candidate.sourceId, reason: 'network_exception' }), candidateId, configVersion: candidate.configVersion } });
    throw error;
  }

  const payload = await response.text();
  const contentType = response.headers.get('content-type');
  const resolvedUrl = response.url || candidate.sourceUrl;
  const rawHash = createHash('sha256').update(payload).digest('hex');

  if (!response.ok) {
    await markSourceFailure(candidate.sourceId, `fetch_failed:${response.status}`);
    await prisma.miningCandidate.update({
      where: { id: candidateId },
      data: {
        fetchStatusCode: response.status,
        fetchContentType: contentType,
        fetchedAt: new Date(),
        canonicalUrl: resolvedUrl,
        html: payload,
        rawHash,
        lastError: `fetch_http_${response.status}`,
        retryCount: { increment: 1 }
      }
    });
    await prisma.pipelineTelemetry.create({ data: { stage: 'fetch', status: 'failure', detail: JSON.stringify({ sourceId: candidate.sourceId, statusCode: response.status }), candidateId, configVersion: candidate.configVersion } });
    throw new Error(`Fetch failed with status ${response.status}`);
  }

  await markSourceSuccess(candidate.sourceId);
  await prisma.miningCandidate.update({
    where: { id: candidateId },
    data: {
      html: payload,
      canonicalUrl: resolvedUrl,
      fetchStatusCode: response.status,
      fetchContentType: contentType,
      fetchedAt: new Date(),
      rawHash,
      status: 'FETCHED',
      lastError: null
    }
  });
  await prisma.pipelineTelemetry.create({ data: { stage: 'fetch', status: 'success', candidateId, configVersion: candidate.configVersion, detail: JSON.stringify({ sourceId: candidate.sourceId, contentType, statusCode: response.status }) } });
  if (enqueueNext) {
    await enqueueNextStage(extractQueue, 'extract', candidateId);
  }
}
