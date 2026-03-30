import { prisma } from '../lib/db.js';
import { buildExportPayload, sendImportBatch } from '../lib/export.js';

export async function runExport(candidateId: string) {
  const c = await prisma.miningCandidate.findUniqueOrThrow({ where: { id: candidateId } });
  const payload = buildExportPayload(c, `mining-${candidateId}`);

  const result = await sendImportBatch(payload);
  await prisma.exportBatch.create({ data: { externalBatchId: payload.externalBatchId, status: 'EXPORTED', configVersion: c.configVersion } });
  await prisma.pipelineTelemetry.create({ data: { stage: 'export', status: 'success', detail: JSON.stringify(result), candidateId, configVersion: c.configVersion } });
}
