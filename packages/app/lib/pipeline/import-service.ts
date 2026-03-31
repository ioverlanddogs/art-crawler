import crypto from 'node:crypto';
import { z } from 'zod';
import type { PrismaClient } from '@/generated/prisma';

const eventSchema = z.object({
  venueUrl: z.string().url(),
  title: z.string().min(1),
  startAt: z.string().datetime(),
  timezone: z.string(),
  source: z.literal('mining-service-v1'),
  miningConfidenceScore: z.number().min(0).max(100),
  observationCount: z.number().int().min(1),
  endAt: z.string().datetime().optional(),
  locationText: z.string().optional(),
  description: z.string().optional(),
  artistNames: z.array(z.string()).optional(),
  imageUrl: z.string().url().optional(),
  sourceUrl: z.string().url().optional(),
  crossSourceMatches: z.number().int().optional()
});

export const importSchema = z.object({
  source: z.literal('mining-service-v1'),
  region: z.string().min(1),
  events: z.array(eventSchema).min(1).max(50)
});

export function computeFingerprint(venueUrl: string, title: string, startAt: string): string {
  const normalized = `${venueUrl}|${title.toLowerCase().trim()}|${startAt}`;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export function confidenceBandFromScore(score: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (score >= 75) return 'HIGH';
  if (score >= 50) return 'MEDIUM';
  return 'LOW';
}

export async function processImportBatch(prisma: PrismaClient, payload: unknown) {
  const parsed = importSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      imported: 0,
      skipped: 0,
      errors: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      importBatchId: null
    };
  }

  const { source, region, events } = parsed.data;

  const siteSetting = await prisma.siteSetting.findUnique({ where: { key: 'mining_import_enabled' } });
  const visibleInModeration = siteSetting?.value === 'true';

  const batch = await prisma.importBatch.create({
    data: {
      externalBatchId: crypto.randomUUID(),
      source,
      region,
      status: 'RECEIVED'
    }
  });

  let imported = 0;
  let skipped = 0;
  const errors: Array<{ index: number; message: string }> = [];
  const seenBatchFingerprints = new Set<string>();

  for (const [index, event] of events.entries()) {
    try {
      const fingerprint = computeFingerprint(event.venueUrl, event.title, event.startAt);
      if (seenBatchFingerprints.has(fingerprint)) {
        skipped += 1;
        continue;
      }
      seenBatchFingerprints.add(fingerprint);

      const existing = await prisma.ingestExtractedEvent.findUnique({ where: { fingerprint } });
      if (existing) {
        skipped += 1;
        continue;
      }

      const domain = new URL(event.venueUrl).hostname;
      await prisma.venueProfile.upsert({
        where: { domain },
        create: {
          domain,
          region,
          name: domain,
          eventsPageUrl: event.venueUrl,
          status: 'ACTIVE'
        },
        update: {
          region,
          eventsPageUrl: event.venueUrl
        }
      });

      if (!visibleInModeration) {
        skipped += 1;
        continue;
      }

      const score = Math.round(event.miningConfidenceScore);
      await prisma.ingestExtractedEvent.create({
        data: {
          region,
          title: event.title,
          startAt: new Date(event.startAt),
          endAt: event.endAt ? new Date(event.endAt) : null,
          timezone: event.timezone,
          locationText: event.locationText,
          description: event.description,
          artistNames: event.artistNames ?? [],
          imageUrl: event.imageUrl,
          sourceUrl: event.sourceUrl ?? event.venueUrl,
          source,
          fingerprint,
          confidenceScore: score,
          confidenceBand: confidenceBandFromScore(score),
          status: 'PENDING',
          miningConfidenceScore: score,
          miningObservationCount: event.observationCount,
          miningCrossSourceCount: event.crossSourceMatches ?? 0,
          importBatchId: batch.id
        }
      });

      imported += 1;
    } catch (error) {
      errors.push({ index, message: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      status: errors.length > 0 ? 'PARTIAL' : 'COMPLETE',
      importedCount: imported,
      skippedCount: skipped,
      errorCount: errors.length
    }
  });

  return { imported, skipped, errors, importBatchId: batch.id };
}
