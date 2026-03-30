import { z } from 'zod';

const responseSchema = z.object({ batchId: z.string(), inserted: z.number() });

export function buildExportPayload(candidate: {
  sourceUrl: string;
  fingerprint: string | null;
  confidenceScore: number | null;
  configVersion: number;
  normalizedJson: unknown;
}, externalBatchId: string) {
  const normalized = (candidate.normalizedJson as any) ?? {};
  return {
    externalBatchId,
    configVersion: candidate.configVersion,
    candidates: [
      {
        title: normalized.title ?? 'Untitled',
        sourceUrl: candidate.sourceUrl,
        sourcePlatform: normalized.platform ?? 'generic',
        fingerprint: candidate.fingerprint ?? 'missing-fingerprint',
        confidenceScore: candidate.confidenceScore ?? 0,
        signals: { exported: 1 }
      }
    ]
  };
}

export async function sendImportBatch(payload: unknown) {
  const res = await fetch(process.env.PIPELINE_IMPORT_URL!, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.MINING_IMPORT_SECRET}`
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`Import failed ${res.status}`);
  return responseSchema.parse(await res.json());
}
