import { requireRole } from '@/lib/auth-guard';
import { authFailure, notFound } from '@/lib/api/response';
import { prisma } from '@/lib/db';
import { computeDiff } from '@/lib/intake/compute-diff';
import { checkPublishReadiness } from '@/lib/intake/publish-gate';
import type { Prisma } from '@/lib/prisma-client';

export async function GET(_: Request, { params }: { params: { changeSetId: string } }) {
  try {
    await requireRole(['viewer', 'moderator', 'operator', 'admin']);
  } catch (error) {
    return authFailure(error);
  }

  const changeSet = await prisma.proposedChangeSet.findUnique({
    where: { id: params.changeSetId },
    include: {
      fieldReviews: true,
      sourceDocument: true,
      matchedEvent: true,
      extractionRun: true
    }
  });

  if (!changeSet) {
    return notFound('Proposed change set');
  }

  const proposedData = asRecord(changeSet.proposedDataJson);
  const canonicalData = changeSet.matchedEvent
    ? asRecord({
        title: changeSet.matchedEvent.title,
        startAt: changeSet.matchedEvent.startAt,
        endAt: changeSet.matchedEvent.endAt,
        timezone: changeSet.matchedEvent.timezone,
        location: changeSet.matchedEvent.location,
        description: changeSet.matchedEvent.description,
        sourceUrl: changeSet.matchedEvent.sourceUrl
      })
    : null;

  const diffResult = computeDiff(proposedData, canonicalData);
  const rejectedFields = new Set(changeSet.fieldReviews.filter((review) => review.decision === 'rejected').map((review) => review.fieldPath));
  const diffWithReviewState = {
    ...diffResult,
    fields: diffResult.fields.map((field) => ({
      ...field,
      state: rejectedFields.has(field.fieldPath) ? 'conflicting' : field.state
    })),
    hasConflicts: diffResult.fields.some((field) => rejectedFields.has(field.fieldPath))
  };

  const [ingestionJob, validationSummary] = await Promise.all([
    prisma.ingestionJob.findFirst({
      where: { sourceDocumentId: changeSet.sourceDocumentId },
      orderBy: { createdAt: 'desc' },
      select: { id: true }
    }),
    Promise.resolve(
      checkPublishReadiness({
        proposedDataJson: proposedData,
        fieldReviews: changeSet.fieldReviews
      })
    )
  ]);

  return Response.json({
    ...changeSet,
    diffResult: diffWithReviewState,
    validationSummary,
    latestIngestionJobId: ingestionJob?.id ?? null
  });
}

export async function POST(_: Request, { params }: { params: { changeSetId: string } }) {
  let session;
  try {
    session = await requireRole(['operator', 'admin']);
  } catch (error) {
    return authFailure(error);
  }

  const changeSet = await prisma.proposedChangeSet.findUnique({
    where: { id: params.changeSetId },
    include: { fieldReviews: true, matchedEvent: true }
  });

  if (!changeSet) {
    return notFound('Proposed change set');
  }

  const reviewed = new Map(changeSet.fieldReviews.map((review) => [review.fieldPath, review]));
  const proposedData = asRecord(changeSet.proposedDataJson);
  const canonicalData = changeSet.matchedEvent
    ? asRecord({
        title: changeSet.matchedEvent.title,
        startAt: changeSet.matchedEvent.startAt,
        endAt: changeSet.matchedEvent.endAt,
        timezone: changeSet.matchedEvent.timezone,
        location: changeSet.matchedEvent.location,
        description: changeSet.matchedEvent.description,
        sourceUrl: changeSet.matchedEvent.sourceUrl
      })
    : null;

  const diffFields = new Map(computeDiff(proposedData, canonicalData).fields.map((field) => [field.fieldPath, field.state]));

  const candidates: string[] = [];
  const skipped: Array<{ fieldPath: string; reason: string }> = [];

  for (const fieldPath of Object.keys(proposedData)) {
    const review = reviewed.get(fieldPath);
    if (review?.decision) {
      skipped.push({ fieldPath, reason: `already_${review.decision}` });
      continue;
    }
    if ((review?.confidence ?? 1) < 0.75) {
      skipped.push({ fieldPath, reason: 'low_confidence' });
      continue;
    }
    if (diffFields.get(fieldPath) === 'conflicting') {
      skipped.push({ fieldPath, reason: 'conflicting' });
      continue;
    }
    candidates.push(fieldPath);
  }

  if (candidates.length === 0) {
    return Response.json({ updated: 0, fieldPaths: [], skipped });
  }

  await Promise.all(
    candidates.map((fieldPath) =>
      prisma.fieldReview.upsert({
        where: { proposedChangeSetId_fieldPath: { proposedChangeSetId: params.changeSetId, fieldPath } },
        create: {
          proposedChangeSetId: params.changeSetId,
          fieldPath,
          decision: 'accepted',
          reviewerId: session.user.id,
          reviewerComment: 'Auto-accepted by approve-all-safe-fields',
          proposedValueJson: proposedData[fieldPath] as Prisma.InputJsonValue
        },
        update: {
          decision: 'accepted',
          reviewerId: session.user.id,
          reviewerComment: 'Auto-accepted by approve-all-safe-fields',
          proposedValueJson: proposedData[fieldPath] as Prisma.InputJsonValue
        }
      })
    )
  );

  return Response.json({ updated: candidates.length, fieldPaths: candidates, skipped });
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
