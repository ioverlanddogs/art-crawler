import { prisma } from '../lib/db.js';
import { sendImportBatch } from '../lib/export.js';

export async function runExport(candidateId: string) {
  const c = await prisma.miningCandidate.findUniqueOrThrow({ where: { id: candidateId } });
  const normalized = (c.normalizedJson as any) ?? {};
  const payload = {
    externalBatchId: `mining-${Date.now()}`,
    configVersion: c.configVersion,
    candidates: [
      {
        title: normalized.title ?? 'Untitled',
        sourceUrl: c.sourceUrl,
        sourcePlatform: normalized.platform ?? 'generic',
        fingerprint: c.fingerprint,
        confidenceScore: c.confidenceScore ?? 0,
        signals: { exported: 1 }
      }
    ]
  };

  const result = await sendImportBatch(payload);
  await prisma.exportBatch.create({ data: { externalBatchId: payload.externalBatchId, status: 'EXPORTED', configVersion: c.configVersion } });
  await prisma.pipelineTelemetry.create({ data: { stage: 'export', status: 'success', detail: JSON.stringify(result), candidateId, configVersion: c.configVersion } });
}
