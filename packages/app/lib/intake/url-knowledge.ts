import type { Prisma, PrismaClient } from '@/lib/prisma-client';

export type ExtractionMode = 'events' | 'artists' | 'artworks' | 'gallery' | 'auto';

export interface ReplayStrategy {
  recommendedMode: ExtractionMode;
  recommendedModel?: string;
  skipFetch: boolean;
  promptHints: string[];
  notes: string;
}

export interface UrlKnowledgeRecord {
  id: string;
  normalizedUrl: string;
  domain: string;
  platformType: string | null;
  requiresJs: boolean;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  successCount: number;
  failureCount: number;
  bestExtractionMode: string | null;
  bestModelVersion: string | null;
  bestConfidenceScore: number | null;
  replayStrategy: ReplayStrategy | null;
  notes: string | null;
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();
    if (
      (parsed.protocol === 'https:' && parsed.port === '443') ||
      (parsed.protocol === 'http:' && parsed.port === '80')
    ) {
      parsed.port = '';
    }
    parsed.hash = '';
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    return url.trim().toLowerCase();
  }
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function buildReplayStrategy(params: {
  platformType: string | null;
  requiresJs: boolean;
  successCount: number;
  failureCount: number;
  bestExtractionMode: string | null;
  bestModelVersion: string | null;
}): ReplayStrategy {
  const mode = (params.bestExtractionMode as ExtractionMode | null) ?? 'auto';
  const hints: string[] = [];

  if (params.requiresJs) {
    hints.push('Page requires JavaScript rendering — consider a headless browser for better results');
  }

  if (params.platformType === 'wordpress') {
    hints.push('WordPress site — check /wp-json/wp/v2/events or similar REST endpoints');
  }

  if (params.platformType === 'eventbrite') {
    hints.push('Eventbrite — structured JSON-LD is usually available in page source');
  }

  if (params.platformType === 'artsy') {
    hints.push('Artsy — use artists or artworks extraction mode for better results');
  }

  if (params.failureCount > 2 && params.successCount === 0) {
    hints.push(
      'Multiple failures with no successes — try a different extraction mode or check if the page requires authentication'
    );
  }

  const skipFetch = params.successCount > 0;

  return {
    recommendedMode: mode,
    recommendedModel: params.bestModelVersion ?? undefined,
    skipFetch,
    promptHints: hints,
    notes: `Based on ${params.successCount} success(es) and ${params.failureCount} failure(s)`
  };
}

export async function recordIntakeSuccess(
  prisma: PrismaClient,
  params: {
    url: string;
    platformType: string | null;
    requiresJs: boolean;
    extractionMode: ExtractionMode;
    modelVersion: string;
    confidenceScore: number;
  }
): Promise<void> {
  try {
    const normalizedUrl = normalizeUrl(params.url);
    const domain = extractDomain(params.url);

    const existing = await prisma.urlKnowledge.findUnique({
      where: { normalizedUrl }
    });

    const newSuccessCount = (existing?.successCount ?? 0) + 1;
    const newFailureCount = existing?.failureCount ?? 0;

    const isBetter = !existing?.bestConfidenceScore || params.confidenceScore > existing.bestConfidenceScore;

    const replayStrategy = buildReplayStrategy({
      platformType: params.platformType,
      requiresJs: params.requiresJs,
      successCount: newSuccessCount,
      failureCount: newFailureCount,
      bestExtractionMode: isBetter
        ? params.extractionMode
        : (existing?.bestExtractionMode ?? params.extractionMode),
      bestModelVersion: isBetter ? params.modelVersion : (existing?.bestModelVersion ?? params.modelVersion)
    });

    await prisma.urlKnowledge.upsert({
      where: { normalizedUrl },
      create: {
        normalizedUrl,
        domain,
        platformType: params.platformType,
        requiresJs: params.requiresJs,
        lastSuccessAt: new Date(),
        successCount: 1,
        failureCount: 0,
        bestExtractionMode: params.extractionMode,
        bestModelVersion: params.modelVersion,
        bestConfidenceScore: params.confidenceScore,
        replayStrategy: replayStrategy as unknown as Prisma.InputJsonValue
      },
      update: {
        platformType: params.platformType,
        requiresJs: params.requiresJs,
        lastSuccessAt: new Date(),
        successCount: newSuccessCount,
        ...(isBetter
          ? {
              bestExtractionMode: params.extractionMode,
              bestModelVersion: params.modelVersion,
              bestConfidenceScore: params.confidenceScore
            }
          : {}),
        replayStrategy: replayStrategy as unknown as Prisma.InputJsonValue
      }
    });
  } catch {
    // Never block the pipeline
  }
}

export async function recordIntakeFailure(
  prisma: PrismaClient,
  params: {
    url: string;
    platformType?: string | null;
    requiresJs?: boolean;
    errorCode: string;
  }
): Promise<void> {
  try {
    const normalizedUrl = normalizeUrl(params.url);
    const domain = extractDomain(params.url);

    const existing = await prisma.urlKnowledge.findUnique({
      where: { normalizedUrl }
    });

    const newFailureCount = (existing?.failureCount ?? 0) + 1;

    const replayStrategy = buildReplayStrategy({
      platformType: params.platformType ?? existing?.platformType ?? null,
      requiresJs: params.requiresJs ?? existing?.requiresJs ?? false,
      successCount: existing?.successCount ?? 0,
      failureCount: newFailureCount,
      bestExtractionMode: existing?.bestExtractionMode ?? null,
      bestModelVersion: existing?.bestModelVersion ?? null
    });

    await prisma.urlKnowledge.upsert({
      where: { normalizedUrl },
      create: {
        normalizedUrl,
        domain,
        platformType: params.platformType ?? null,
        requiresJs: params.requiresJs ?? false,
        lastFailureAt: new Date(),
        successCount: 0,
        failureCount: 1,
        replayStrategy: replayStrategy as unknown as Prisma.InputJsonValue
      },
      update: {
        lastFailureAt: new Date(),
        failureCount: newFailureCount,
        ...(params.platformType !== undefined ? { platformType: params.platformType } : {}),
        ...(params.requiresJs !== undefined ? { requiresJs: params.requiresJs } : {}),
        replayStrategy: replayStrategy as unknown as Prisma.InputJsonValue
      }
    });
  } catch {
    // Never block the pipeline
  }
}

export async function getUrlKnowledge(
  prisma: PrismaClient,
  url: string
): Promise<UrlKnowledgeRecord | null> {
  try {
    const normalizedUrl = normalizeUrl(url);
    const record = await prisma.urlKnowledge.findUnique({
      where: { normalizedUrl }
    });
    if (!record) return null;

    return {
      ...record,
      replayStrategy: record.replayStrategy ? (record.replayStrategy as unknown as ReplayStrategy) : null
    };
  } catch {
    return null;
  }
}

export async function getDomainKnowledge(
  prisma: PrismaClient,
  domain: string
): Promise<UrlKnowledgeRecord[]> {
  try {
    const records = await prisma.urlKnowledge.findMany({
      where: { domain: domain.toLowerCase() },
      orderBy: { lastSuccessAt: 'desc' },
      take: 20
    });

    return records.map((r) => ({
      ...r,
      replayStrategy: r.replayStrategy ? (r.replayStrategy as unknown as ReplayStrategy) : null
    }));
  } catch {
    return [];
  }
}
