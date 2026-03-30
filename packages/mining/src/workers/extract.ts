import { prisma } from '../lib/db.js';
import { normaliseQueue } from '../queues.js';
import { enqueueNextStage } from '../lib/stage-chaining.js';
import { markSourceFailure, markSourceSuccess } from '../lib/source-health.js';

export interface AiExtractor {
  extract(text: string): Promise<Record<string, unknown>>;
}

export const mockAiExtractor: AiExtractor = {
  async extract() {
    return { title: 'Sample Event', platform: 'generic' };
  }
};

function extractJsonLd(html: string): Record<string, unknown> | null {
  const scripts = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const script of scripts) {
    const body = script[1]?.trim();
    if (!body) continue;
    try {
      const parsed = JSON.parse(body);
      if (Array.isArray(parsed)) {
        const firstObject = parsed.find((item) => item && typeof item === 'object');
        if (firstObject) return firstObject as Record<string, unknown>;
      }
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      continue;
    }
  }
  return null;
}

function parseBySourceType(sourceType: string, html: string): Record<string, unknown> | null {
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (!titleMatch) {
    return null;
  }
  if (sourceType === 'museum') {
    return { title: titleMatch[1].trim(), platform: 'museum_calendar' };
  }
  if (sourceType === 'event_platform') {
    return { title: titleMatch[1].trim(), platform: 'event_platform' };
  }
  return null;
}

export async function runExtract(candidateId: string, ai: AiExtractor = mockAiExtractor, enqueueNext = true) {
  const candidate = await prisma.miningCandidate.findUniqueOrThrow({ where: { id: candidateId }, include: { source: true } });
  const html = candidate.html ?? '';

  const jsonLd = extractJsonLd(html);
  const sourceTypeExtract = !jsonLd ? parseBySourceType(candidate.entityType ?? candidate.source?.sourceType ?? 'generic', html) : null;
  const genericExtract = !jsonLd && !sourceTypeExtract ? await ai.extract(html) : null;
  const extracted = jsonLd ?? sourceTypeExtract ?? genericExtract ?? {};
  const parserType = jsonLd ? 'json_ld' : sourceTypeExtract ? 'source_type' : 'generic_fallback';

  const hasExtractedCoreFields = Boolean((extracted as any).name ?? (extracted as any).title);
  if (candidate.sourceId) {
    if (hasExtractedCoreFields) {
      await markSourceSuccess(candidate.sourceId);
    } else {
      await markSourceFailure(candidate.sourceId, 'extraction_missing_title_or_name');
    }
  }

  await prisma.miningCandidate.update({ where: { id: candidateId }, data: { extractedJson: extracted, parserType, status: 'EXTRACTED', lastError: hasExtractedCoreFields ? null : 'extraction_incomplete' } });
  await prisma.pipelineTelemetry.create({ data: { stage: 'extract', status: hasExtractedCoreFields ? 'success' : 'failure', candidateId, configVersion: candidate.configVersion, detail: JSON.stringify({ sourceId: candidate.sourceId, parserType }) } });
  if (enqueueNext) {
    await enqueueNextStage(normaliseQueue, 'normalise', candidateId);
  }
}
