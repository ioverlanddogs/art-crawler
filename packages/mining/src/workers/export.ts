import { prisma } from '../lib/db.js';
import { buildExportPayload, sendImportBatch } from '../lib/export.js';
import { markSourceSuccess } from '../lib/source-health.js';

export async function runExport(candidateId: string) {
  const c = await prisma.miningCandidate.findUniqueOrThrow({ where: { id: candidateId } });
  const payload = buildExportPayload(c);

  const result = await sendImportBatch(payload);
  if (c.sourceId) {
    await markSourceSuccess(c.sourceId);
  }
  await prisma.exportBatch.create({ data: { externalBatchId: result.importBatchId ?? `mining-${candidateId}`, status: 'EXPORTED', configVersion: c.configVersion } });
  await prisma.pipelineTelemetry.create({ data: { sourceId: c.sourceId, stage: 'export', status: 'success', detail: JSON.stringify({ sourceId: c.sourceId, result }), candidateId, configVersion: c.configVersion } });
}
