import { z } from 'zod';

const responseSchema = z.object({
  imported: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  errors: z.array(z.unknown()),
  importBatchId: z.string().nullable()
});

export function buildExportPayload(candidate: {
  sourceUrl: string;
  fingerprint: string | null;
  confidenceScore: number | null;
  configVersion: number;
  region?: string | null;
  normalizedJson: unknown;
}) {
  const normalized = (candidate.normalizedJson as any) ?? {};
  const startAt = normalized.startAt ?? normalized.start_at ?? new Date().toISOString();

  return {
    source: 'mining-service-v1' as const,
    region: candidate.region ?? normalized.region ?? 'global',
    events: [
      {
        title: normalized.title ?? 'Untitled',
        venueUrl: normalized.venueUrl ?? normalized.venue_url ?? candidate.sourceUrl,
        startAt,
        timezone: normalized.timezone ?? 'UTC',
        source: 'mining-service-v1' as const,
        miningConfidenceScore: Math.round((candidate.confidenceScore ?? 0) * 100),
        observationCount: normalized.observationCount ?? normalized.observation_count ?? 1,
        endAt: normalized.endAt ?? normalized.end_at,
        locationText: normalized.locationText ?? normalized.location_text,
        description: normalized.description,
        artistNames: normalized.artistNames ?? normalized.artist_names,
        imageUrl: normalized.imageUrl ?? normalized.image_url,
        sourceUrl: candidate.sourceUrl,
        crossSourceMatches: normalized.crossSourceMatches ?? normalized.cross_source_matches
      }
    ]
  };
}

export async function sendImportBatch(payload: unknown) {
  const secret = process.env.MINING_SERVICE_SECRET ?? process.env.MINING_IMPORT_SECRET;
  const res = await fetch(process.env.PIPELINE_IMPORT_URL!, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${secret}`
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`Import failed ${res.status}`);
  return responseSchema.parse(await res.json());
}
