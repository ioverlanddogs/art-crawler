import { z } from 'zod';
import { getImportSecretFromEnv } from './env.js';

const responseSchema = z.object({
  imported: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  errors: z.array(z.unknown()),
  importBatchId: z.string().nullable()
});

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export function buildExportPayload(candidate: {
  sourceUrl: string;
  fingerprint: string | null;
  confidenceScore: number | null;
  configVersion: number;
  region?: string | null;
  normalizedJson: unknown;
}) {
  const normalized = asRecord(candidate.normalizedJson);
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
  const secret = getImportSecretFromEnv();
  if (!secret) {
    throw new Error(
      '[mining] missing import auth secret: set MINING_IMPORT_SECRET (MINING_SERVICE_SECRET is deprecated fallback)'
    );
  }

  const importUrl = process.env.PIPELINE_IMPORT_URL;
  if (!importUrl) {
    throw new Error('[mining] missing required env var: PIPELINE_IMPORT_URL');
  }

  const res = await fetch(importUrl, {
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
