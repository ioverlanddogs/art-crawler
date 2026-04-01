import { prisma } from '../lib/db.js';
import { extractQueue } from '../queues.js';
import { enqueueNextStage } from '../lib/stage-chaining.js';
import { createHash } from 'node:crypto';
import { markSourceFailure, markSourceSuccess } from '../lib/source-health.js';
import { isApprovedBySourcePolicy, normalizeUrlForComparison, type SourcePolicy } from '../lib/source-url-policy.js';

const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 30_000;

async function persistFetchFailure(candidateId: string, payload: {
  canonicalUrl: string;
  fetchStatusCode?: number | null;
  fetchContentType?: string | null;
  lastError: string;
}) {
  await prisma.miningCandidate.update({
    where: { id: candidateId },
    data: {
      canonicalUrl: payload.canonicalUrl,
      fetchStatusCode: payload.fetchStatusCode ?? null,
      fetchContentType: payload.fetchContentType ?? null,
      fetchedAt: new Date(),
      lastError: payload.lastError,
      retryCount: { increment: 1 }
    }
  });
}

async function fetchWithPolicy(seedUrl: string, sourcePolicy: SourcePolicy) {
  let currentUrl = normalizeUrlForComparison(seedUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('fetch_timeout'), FETCH_TIMEOUT_MS);

  try {
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      const response = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'user-agent': 'ArtioMiningBot/1.0 (+https://artio.local/mining)'
        }
      });

      const isRedirect = response.status >= 300 && response.status < 400;
      if (!isRedirect) {
        clearTimeout(timeout);
        return { response, finalUrl: currentUrl };
      }

      const location = response.headers.get('location');
      if (!location) {
        throw new Error('redirect_missing_location');
      }

      const nextUrl = normalizeUrlForComparison(new URL(location, currentUrl).toString());
      if (!isApprovedBySourcePolicy(nextUrl, sourcePolicy)) {
        throw new Error('redirect_left_approved_scope');
      }

      currentUrl = nextUrl;
    }

    throw new Error('redirect_limit_exceeded');
  } catch (error: unknown) {
    const timeoutReason = controller.signal.aborted
      ? String(controller.signal.reason ?? '')
      : '';
    if (timeoutReason === 'fetch_timeout') {
      throw new Error('fetch_timeout');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function runFetch(candidateId: string, enqueueNext = true) {
  const candidate = await prisma.miningCandidate.findUniqueOrThrow({
    where: { id: candidateId },
    include: { source: true }
  });
  if (!candidate.sourceId || !candidate.source) {
    await prisma.pipelineTelemetry.create({ data: { sourceId: candidate.sourceId, stage: 'fetch', status: 'failure', detail: 'missing trusted source relation', candidateId, configVersion: candidate.configVersion } });
    throw new Error('Missing trusted source relation');
  }

  const normalizedSourceUrl = normalizeUrlForComparison(candidate.sourceUrl);
  const sourcePolicy = {
    domain: candidate.source.domain,
    allowedPathPatterns: candidate.source.allowedPathPatterns,
    blockedPathPatterns: candidate.source.blockedPathPatterns
  };

  if (!isApprovedBySourcePolicy(normalizedSourceUrl, sourcePolicy)) {
    await markSourceFailure(candidate.sourceId, 'url_not_approved_for_source');
    await persistFetchFailure(candidateId, { canonicalUrl: normalizedSourceUrl, lastError: 'url_not_approved_for_source' });
    await prisma.pipelineTelemetry.create({ data: { sourceId: candidate.sourceId, stage: 'fetch', status: 'failure', detail: 'URL not approved by source policy', candidateId, configVersion: candidate.configVersion } });
    throw new Error('URL is not approved by trusted source policy');
  }

  let response: Response;
  let resolvedUrl = normalizedSourceUrl;
  try {
    const result = await fetchWithPolicy(normalizedSourceUrl, sourcePolicy);
    response = result.response;
    resolvedUrl = result.finalUrl;
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : 'fetch_exception';
    const knownFetchFailure = reason.startsWith('redirect_') || reason === 'fetch_timeout';
    await markSourceFailure(candidate.sourceId, knownFetchFailure ? reason : `fetch_exception:${reason}`);
    await persistFetchFailure(candidateId, {
      canonicalUrl: resolvedUrl,
      lastError: knownFetchFailure ? reason : `fetch_exception:${reason}`
    });
    await prisma.pipelineTelemetry.create({ data: { sourceId: candidate.sourceId, stage: 'fetch', status: 'failure', detail: JSON.stringify({ sourceId: candidate.sourceId, reason }), candidateId, configVersion: candidate.configVersion } });
    throw error;
  }

  const payload = await response.text();
  if (payload.length > 5_000_000) {
    await markSourceFailure(candidate.sourceId, 'response_too_large');
    await persistFetchFailure(candidateId, {
      canonicalUrl: resolvedUrl,
      fetchStatusCode: response.status,
      fetchContentType: response.headers.get('content-type'),
      lastError: 'response_too_large'
    });
    await prisma.pipelineTelemetry.create({
      data: {
        stage: 'fetch',
        sourceId: candidate.sourceId,
        status: 'failure',
        detail: 'response_too_large',
        candidateId,
        configVersion: candidate.configVersion
      }
    });
    throw new Error('Response too large');
  }
  const contentType = response.headers.get('content-type');
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
    await prisma.pipelineTelemetry.create({ data: { sourceId: candidate.sourceId, stage: 'fetch', status: 'failure', detail: JSON.stringify({ sourceId: candidate.sourceId, statusCode: response.status }), candidateId, configVersion: candidate.configVersion } });
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
  await prisma.pipelineTelemetry.create({ data: { sourceId: candidate.sourceId, stage: 'fetch', status: 'success', candidateId, configVersion: candidate.configVersion, detail: JSON.stringify({ sourceId: candidate.sourceId, contentType, statusCode: response.status }) } });
  if (enqueueNext) {
    await enqueueNextStage(extractQueue, 'extract', candidateId);
  }
}
