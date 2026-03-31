import { requireRole } from '@/lib/auth-guard';
import { authFailure, err, notFound } from '@/lib/api/response';
import { prisma } from '@/lib/db';
import { FieldDecision, type Prisma } from '@/lib/prisma-client';

const ALLOWED_DECISIONS = new Set<FieldDecision>(['accepted', 'edited', 'rejected', 'uncertain']);

export async function PATCH(request: Request, { params }: { params: { changeSetId: string; fieldPath: string } }) {
  let session;
  try {
    session = await requireRole(['operator', 'admin']);
  } catch (error) {
    return authFailure(error);
  }

  const payload = await request.json().catch(() => null);
  const decision = payload?.decision;
  const reviewerComment = typeof payload?.reviewerComment === 'string' ? payload.reviewerComment : null;
  const hasEditedValue = payload && Object.prototype.hasOwnProperty.call(payload, 'editedValue');
  const editedValue = hasEditedValue ? payload.editedValue : undefined;

  if (!ALLOWED_DECISIONS.has(decision)) {
    return err('Invalid decision.', 'INVALID_DECISION', 400);
  }

  const fieldPath = decodeURIComponent(params.fieldPath);

  const existingChangeSet = await prisma.proposedChangeSet.findUnique({ where: { id: params.changeSetId } });
  if (!existingChangeSet) {
    return notFound('Proposed change set');
  }

  if (hasEditedValue) {
    const proposedData = asRecord(existingChangeSet.proposedDataJson);
    proposedData[fieldPath] = editedValue;
    await prisma.proposedChangeSet.update({
      where: { id: params.changeSetId },
      data: { proposedDataJson: proposedData as Prisma.InputJsonObject }
    });
  }

  const fieldReview = await prisma.fieldReview.upsert({
    where: {
      proposedChangeSetId_fieldPath: {
        proposedChangeSetId: params.changeSetId,
        fieldPath
      }
    },
    create: {
      proposedChangeSetId: params.changeSetId,
      fieldPath,
      decision,
      reviewerId: session.user.id,
      reviewerComment,
      proposedValueJson: hasEditedValue ? editedValue : undefined
    },
    update: {
      decision,
      reviewerId: session.user.id,
      reviewerComment,
      proposedValueJson: hasEditedValue ? editedValue : undefined
    }
  });

  return Response.json(fieldReview);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return { ...(value as Record<string, unknown>) };
}
