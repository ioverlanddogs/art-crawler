import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const candidateSchema = z.object({
  title: z.string().min(1),
  sourceUrl: z.string().url(),
  sourcePlatform: z.string().min(1),
  fingerprint: z.string().min(8),
  confidenceScore: z.number().min(0).max(1),
  signals: z.record(z.number()).default({})
});

export const importSchema = z.object({
  externalBatchId: z.string().min(1),
  configVersion: z.number().int().nonnegative(),
  candidates: z.array(candidateSchema).min(1)
});

export async function processImportBatch(prisma: PrismaClient, payload: unknown) {
  const body = importSchema.parse(payload);

  const batch = await prisma.importBatch.upsert({
    where: { externalBatchId: body.externalBatchId },
    create: { externalBatchId: body.externalBatchId, status: 'RECEIVED' },
    update: { status: 'RECEIVED' }
  });

  const incomingFingerprints = body.candidates.map((c) => c.fingerprint);
  const existingRecords = await prisma.candidate.findMany({
    where: { fingerprint: { in: incomingFingerprints } },
    select: { fingerprint: true, id: true }
  });
  const existingByFingerprint = new Map(existingRecords.map((r: { fingerprint: string; id: string }) => [r.fingerprint, r.id]));

  let inserted = 0;
  for (const c of body.candidates) {
    const existingId = existingByFingerprint.get(c.fingerprint);
    if (existingId) {
      await prisma.pipelineTelemetry.create({
        data: {
          stage: 'import',
          status: 'skip',
          detail: 'fingerprint exists',
          configVersion: body.configVersion,
          candidateId: existingId
        }
      });
      continue;
    }

    const candidate = await prisma.candidate.create({
      data: {
        title: c.title,
        sourceUrl: c.sourceUrl,
        sourcePlatform: c.sourcePlatform,
        fingerprint: c.fingerprint,
        confidenceScore: c.confidenceScore,
        configVersion: body.configVersion,
        importBatchId: batch.id
      }
    });

    await prisma.confidenceHistory.create({
      data: { candidateId: candidate.id, score: c.confidenceScore, signals: c.signals }
    });

    await prisma.pipelineTelemetry.create({
      data: { stage: 'import', status: 'success', configVersion: body.configVersion, candidateId: candidate.id }
    });
    inserted += 1;
  }

  return { batchId: batch.id, inserted };
}

export async function listModerationCandidates(prisma: PrismaClient) {
  const setting = await prisma.siteSetting.findUnique({ where: { key: 'mining_import_enabled' } });
  if (setting?.value !== 'true') return [];
  return prisma.candidate.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'desc' } });
}
