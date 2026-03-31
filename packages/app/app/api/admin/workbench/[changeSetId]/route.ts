import { requireRole } from '@/lib/auth-guard';
import { authFailure, err, notFound } from '@/lib/api/response';
import { prisma } from '@/lib/db';

export async function PATCH(request: Request, { params }: { params: { changeSetId: string } }) {
  try {
    await requireRole(['operator', 'admin']);
  } catch (error) {
    return authFailure(error);
  }

  const payload = await request.json().catch(() => null);
  const reviewStatus = payload?.reviewStatus;
  const notes = typeof payload?.notes === 'string' ? payload.notes : undefined;

  if (reviewStatus !== 'draft') {
    return err('Only reviewStatus=draft is supported.', 'INVALID_REVIEW_STATUS', 400);
  }

  const updated = await prisma.proposedChangeSet.update({
    where: { id: params.changeSetId },
    data: { reviewStatus: 'draft', ...(notes !== undefined ? { notes } : {}) }
  }).catch(() => null);

  if (!updated) {
    return notFound('Proposed change set');
  }

  return Response.json(updated);
}
