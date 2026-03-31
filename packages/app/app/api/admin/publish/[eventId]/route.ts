import { requireRole } from '@/lib/auth-guard';
import { authFailure, err, notFound } from '@/lib/api/response';
import { prisma } from '@/lib/db';
import type { Prisma } from '@/lib/prisma-client';
import { checkPublishReadiness } from '@/lib/intake/publish-gate';

export async function GET(_request: Request, { params }: { params: { eventId: string } }) {
  try {
    await requireRole(['viewer', 'moderator', 'operator', 'admin']);
  } catch (error) {
    return authFailure(error);
  }

  const event = await prisma.event.findUnique({ where: { id: params.eventId } });
  if (!event) return notFound('Event');

  const latestApprovedChangeSet = await prisma.proposedChangeSet.findFirst({
    where: {
      matchedEventId: event.id,
      reviewStatus: 'approved'
    },
    include: {
      fieldReviews: true,
      extractionRun: true,
      duplicateCandidates: true
    },
    orderBy: { reviewedAt: 'desc' }
  });

  if (!latestApprovedChangeSet) {
    return Response.json({ event, publishDetail: null });
  }

  const diffJson = asRecord(latestApprovedChangeSet.diffJson);
  const changedFields = Object.keys(diffJson);
  const evidenceMap = asRecord(latestApprovedChangeSet.extractionRun?.evidenceJson);
  const readiness = checkPublishReadiness({
    proposedDataJson: asRecord(latestApprovedChangeSet.proposedDataJson),
    fieldReviews: latestApprovedChangeSet.fieldReviews,
    duplicateCandidates: latestApprovedChangeSet.duplicateCandidates
  });

  return Response.json({
    event,
    publishDetail: {
      changeSetId: latestApprovedChangeSet.id,
      reviewer: latestApprovedChangeSet.reviewedByUserId,
      reviewedAt: latestApprovedChangeSet.reviewedAt,
      blockers: readiness.blockers,
      warnings: readiness.warnings,
      evidenceCoverage: Object.keys(evidenceMap).length,
      changedFields: changedFields.map((fieldPath) => ({
        fieldPath,
        previous: diffJson[fieldPath] && typeof diffJson[fieldPath] === 'object' ? asRecord(diffJson[fieldPath]).from ?? null : null,
        next: diffJson[fieldPath] && typeof diffJson[fieldPath] === 'object' ? asRecord(diffJson[fieldPath]).to ?? null : null,
        hasEvidence: Object.prototype.hasOwnProperty.call(evidenceMap, fieldPath)
      }))
    }
  });
}

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
      fieldReviews: true,
      duplicateCandidates: true
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
    fieldReviews: latestApprovedChangeSet.fieldReviews,
    duplicateCandidates: latestApprovedChangeSet.duplicateCandidates
  });

  if (!readiness.ready) {
    return Response.json(
      {
        blockers: readiness.blockers,
        warnings: readiness.warnings,
        blockerReasons: readiness.blockers.map((blocker) =>
          blocker.includes('duplicate') ? 'duplicate_blocker' : blocker.includes('corrobor') ? 'corroboration_conflict' : 'field_review'
        )
      },
      { status: 409 }
    );
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

    const publishedEvent = await tx.event.update({
      where: { id: event.id },
      data: {
        publishStatus: 'published',
        publishedAt: now
      }
    });

    const lastVersion = await tx.canonicalRecordVersion.findFirst({
      where: { eventId: event.id },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true }
    });
    const nextVersion = (lastVersion?.versionNumber ?? 0) + 1;

    await tx.canonicalRecordVersion.create({
      data: {
        eventId: event.id,
        versionNumber: nextVersion,
        dataJson: {
          title: publishedEvent.title,
          startAt: publishedEvent.startAt,
          endAt: publishedEvent.endAt,
          timezone: publishedEvent.timezone,
          location: publishedEvent.location,
          description: publishedEvent.description,
          sourceUrl: publishedEvent.sourceUrl,
          publishStatus: publishedEvent.publishStatus,
          publishedAt: publishedEvent.publishedAt,
          duplicateResolution: (latestApprovedChangeSet.duplicateCandidates ?? []).map((candidate) => ({
            candidateId: candidate.id,
            resolutionStatus: candidate.resolutionStatus,
            reviewerNote: candidate.reviewerNote,
            canonicalEventId: candidate.canonicalEventId,
            corroborationSourceCount: candidate.corroborationSourceCount,
            conflictingSourceCount: candidate.conflictingSourceCount
          }))
        },
        changeSummary: releaseSummary ?? null,
        sourceDocumentId: latestApprovedChangeSet.sourceDocumentId,
        proposedChangeSetId: latestApprovedChangeSet.id,
        publishBatchId: publishBatch.id,
        createdByUserId: session.user.id
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
