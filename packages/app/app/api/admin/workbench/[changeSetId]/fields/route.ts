import { requireRole } from '@/lib/auth-guard';
import { authFailure, notFound } from '@/lib/api/response';
import { prisma } from '@/lib/db';
import { computeDiff } from '@/lib/intake/compute-diff';

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

  return Response.json({
    ...changeSet,
    diffResult: diffWithReviewState
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
