import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const candidateSchema = z.object({
  title: z.string().min(1),
  sourceUrl: z.string().url(),
  sourcePlatform: z.string().min(1),
  fingerprint: z.string().min(8),
  confidenceScore: z.number().min(0).max(1),
  signals: z.record(z.number()).default({})
});

const schema = z.object({
  externalBatchId: z.string(),
  configVersion: z.number().int().nonnegative(),
  candidates: z.array(candidateSchema).min(1)
});

export async function POST(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.MINING_IMPORT_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = schema.parse(await req.json());

  const batch = await prisma.importBatch.upsert({
    where: { externalBatchId: body.externalBatchId },
    create: { externalBatchId: body.externalBatchId, status: 'RECEIVED' },
    update: { status: 'RECEIVED' }
  });

  const inserted = [];
  for (const c of body.candidates) {
    const existing = await prisma.candidate.findUnique({ where: { fingerprint: c.fingerprint } });
    if (existing) {
      await prisma.pipelineTelemetry.create({ data: { stage: 'import', status: 'skip', detail: 'fingerprint exists', configVersion: body.configVersion, candidateId: existing.id } });
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
      data: {
        candidateId: candidate.id,
        score: c.confidenceScore,
        signals: c.signals
      }
    });

    await prisma.pipelineTelemetry.create({ data: { stage: 'import', status: 'success', configVersion: body.configVersion, candidateId: candidate.id } });
    inserted.push(candidate);
  }

  return NextResponse.json({ batchId: batch.id, inserted: inserted.length });
}
