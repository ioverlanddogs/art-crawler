import { requireRole } from '@/lib/auth-guard';
import { authFailure, err, notFound } from '@/lib/api/response';
import { prisma } from '@/lib/db';
import type { Prisma } from '@/lib/prisma-client';
import { checkPublishReadiness } from '@/lib/intake/publish-gate';

export async function POST(request: Request, { params }: { params: { eventId: string } }) {
  let session;
  try {
    session = await requireRole(['operator', 'admin']);
  } catch (error) {
    return authFailure(error);
  }

  const payload = await request.json().catch(() => ({}));
  const releaseSummary = typeof payload?.releaseSummary === 'string' ? payload.releaseSummary : undefined;

  const event = await prisma.event.findUnique({ where: { id: params.eventId } });
  if (!event) {
    return notFound('Event');
  }

  if (event.publishStatus !== 'ready') {
    return err("Event is not in 'ready' publish status.", 'EVENT_NOT_READY', 400);
  }

  const latestApprovedChangeSet = await prisma.proposedChangeSet.findFirst({
    where: {
      matchedEventId: event.id,
      reviewStatus: 'approved'
    },
    include: {
      fieldReviews: true
    },
    orderBy: { reviewedAt: 'desc' }
  });

  if (!latestApprovedChangeSet) {
    return Response.json(
      {
        blockers: ['No approved change set found for this event.'],
        warnings: []
      },
      { status: 409 }
    );
  }

  const readiness = checkPublishReadiness({
    proposedDataJson: asRecord(latestApprovedChangeSet.proposedDataJson),
    fieldReviews: latestApprovedChangeSet.fieldReviews
  });

  if (!readiness.ready) {
    return Response.json({ blockers: readiness.blockers, warnings: readiness.warnings }, { status: 409 });
  }

  const now = new Date();
  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const publishBatch = await tx.publishBatch.create({
      data: {
        eventIdsJson: [event.id],
        releaseSummary,
        createdByUserId: session.user.id,
        status: 'published',
        publishedAt: now
      }
    });

    await tx.event.update({
      where: { id: event.id },
      data: {
        publishStatus: 'published',
        publishedAt: now
      }
    });

    await tx.ingestionJob.updateMany({
      where: {
        sourceDocumentId: latestApprovedChangeSet.sourceDocumentId
      },
      data: { status: 'published' }
    });

    return publishBatch;
  });

  return Response.json({ publishBatchId: result.id, eventId: event.id });
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
