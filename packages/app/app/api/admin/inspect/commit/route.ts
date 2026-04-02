import { requireRole } from '@/lib/auth-guard';
import { authFailure, err } from '@/lib/api/response';
import { prisma } from '@/lib/db';
import { fingerprintUrl } from '@/lib/intake/fingerprint';
import { z } from 'zod';
import type { Prisma } from '@/lib/prisma-client';

export const dynamic = 'force-dynamic';

const schema = z.object({
  url: z.string().url(),
  mode: z.enum(['events', 'artists', 'artworks', 'gallery', 'auto']),
  modelVersion: z.string(),
  fields: z.record(z.unknown()),
  confidence: z.record(z.number()).optional(),
  evidence: z.record(z.unknown()).optional(),
  humanReviewed: z.boolean().default(true),
});

export async function POST(req: Request) {
  let session;
  try {
    session = await requireRole(['operator', 'admin']);
  } catch (error) {
    return authFailure(error);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err('Invalid payload', 'VALIDATION_ERROR', 400);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return err('Invalid commit payload', 'VALIDATION_ERROR', 400);
  }

  const { url, mode, modelVersion, fields, confidence, evidence, humanReviewed } = parsed.data;

  const fingerprint = fingerprintUrl(url);

  const sourceDocument = await prisma.sourceDocument.create({
    data: {
      sourceUrl: url,
      sourceType: mode,
      fingerprint,
      fetchedAt: new Date(),
      metadataJson: {
        humanReviewed,
        committedFromInspector: true,
        inspectorMode: mode,
      },
    },
  });

  const job = await prisma.ingestionJob.create({
    data: {
      sourceDocumentId: sourceDocument.id,
      requestedByUserId: session.user.id,
      status: 'needs_review',
      startedAt: new Date(),
      completedAt: new Date(),
    },
  });

  const extractionRun = await prisma.extractionRun.create({
    data: {
      sourceDocumentId: sourceDocument.id,
      modelVersion,
      parserVersion: humanReviewed ? 'inspector-human-reviewed-v1' : 'inspector-v1',
      extractedFieldsJson: fields as Prisma.InputJsonValue,
      confidenceJson: (confidence ?? {}) as Prisma.InputJsonValue,
      evidenceJson: (evidence ?? {}) as Prisma.InputJsonValue,
      warningsJson: [] as Prisma.InputJsonValue,
    },
  });

  const proposedChangeSet = await prisma.proposedChangeSet.create({
    data: {
      sourceDocumentId: sourceDocument.id,
      extractionRunId: extractionRun.id,
      proposedDataJson: fields as Prisma.InputJsonValue,
      reviewStatus: humanReviewed ? 'in_review' : 'draft',
      notes: humanReviewed
        ? `Committed from URL inspector after human review. Mode: ${mode}.`
        : `Committed from URL inspector. Mode: ${mode}.`,
    },
  });

  await prisma.ingestionLog
    .create({
      data: {
        sourceDocumentId: sourceDocument.id,
        ingestionJobId: job.id,
        stage: 'complete',
        status: 'success',
        message: `Committed from inspector — human reviewed: ${humanReviewed}, mode: ${mode}`,
        detail: {
          committedFromInspector: true,
          humanReviewed,
          mode,
          modelVersion,
        },
      },
    })
    .catch(() => {
      /* non-blocking */
    });

  return Response.json({
    ingestionJobId: job.id,
    sourceDocumentId: sourceDocument.id,
    proposedChangeSetId: proposedChangeSet.id,
    reviewStatus: proposedChangeSet.reviewStatus,
  });
}
