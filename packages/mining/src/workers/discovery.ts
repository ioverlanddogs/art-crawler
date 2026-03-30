import { prisma } from '../lib/db.js';
import { loadActiveConfig } from '../lib/config.js';
import { fetchQueue } from '../queues.js';
import { enqueueNextStage } from '../lib/stage-chaining.js';
import { isSourceHealthy } from '../lib/source-health.js';
import { normalizeUrlForComparison } from '../lib/source-url-policy.js';

export async function runDiscovery(enqueueNext = true) {
  const cfg = await loadActiveConfig();
  const activeSources = await prisma.trustedSource.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { trustTier: 'desc' }
  });

  const recentThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
  let lastCandidate = null;

  for (const source of activeSources) {
    if (!isSourceHealthy(source)) {
      await prisma.pipelineTelemetry.create({
        data: {
          stage: 'discovery',
          status: 'skip',
          configVersion: cfg.version,
          detail: JSON.stringify({ sourceId: source.id, reason: 'source_unhealthy_or_paused' })
        }
      });
      continue;
    }

    const seedUrl = normalizeUrlForComparison(source.seedUrl);
    const recentCandidates = await prisma.miningCandidate.findMany({
      where: {
        sourceId: source.id,
        createdAt: { gte: recentThreshold }
      },
      select: {
        id: true,
        sourceUrl: true,
        canonicalUrl: true
      }
    });

    const duplicate = recentCandidates.find((candidate: { id: string; sourceUrl: string; canonicalUrl: string | null }) => {
      const sourceUrl = candidate.sourceUrl ? normalizeUrlForComparison(candidate.sourceUrl) : null;
      const canonicalUrl = candidate.canonicalUrl ? normalizeUrlForComparison(candidate.canonicalUrl) : null;
      return sourceUrl === seedUrl || canonicalUrl === seedUrl;
    });

    if (duplicate) {
      await prisma.pipelineTelemetry.create({
        data: {
          stage: 'discovery',
          status: 'skip',
          candidateId: duplicate.id,
          configVersion: cfg.version,
          detail: JSON.stringify({ sourceId: source.id, reason: 'recent_duplicate_seed_url' })
        }
      });
      continue;
    }

    const candidate = await prisma.miningCandidate.create({
      data: {
        sourceUrl: seedUrl,
        sourceId: source.id,
        sourceDomain: source.domain,
        discoveredFromUrl: seedUrl,
        canonicalUrl: seedUrl,
        discoveryMethod: 'seeded_registry',
        entityType: source.sourceType,
        region: source.region,
        status: 'DISCOVERED',
        configVersion: cfg.version
      }
    });

    await prisma.trustedSource.update({
      where: { id: source.id },
      data: { lastDiscoveredAt: new Date() }
    });

    await prisma.pipelineTelemetry.create({
      data: {
        stage: 'discovery',
        status: 'success',
        candidateId: candidate.id,
        configVersion: cfg.version,
        detail: JSON.stringify({ sourceId: source.id, discoveryMethod: 'seeded_registry' })
      }
    });

    if (enqueueNext) {
      await enqueueNextStage(fetchQueue, 'fetch', candidate.id);
    }
    lastCandidate = candidate;
  }

  if (!lastCandidate) {
    throw new Error('No eligible trusted sources found for discovery');
  }
  return lastCandidate;
}
