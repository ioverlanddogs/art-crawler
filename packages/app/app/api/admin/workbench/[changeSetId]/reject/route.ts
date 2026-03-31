import { requireRole } from '@/lib/auth-guard';
import { authFailure, err, notFound } from '@/lib/api/response';
import { prisma } from '@/lib/db';
import type { Prisma } from '@/lib/prisma-client';

export async function POST(request: Request, { params }: { params: { changeSetId: string } }) {
  try {
    await requireRole(['operator', 'admin']);
  } catch (error) {
    return authFailure(error);
  }

  const payload = await request.json().catch(() => null);
  const reason = typeof payload?.reason === 'string' ? payload.reason.trim() : '';

  if (!reason) {
    return err('A rejection reason is required.', 'REASON_REQUIRED', 400);
  }

  const changeSet = await prisma.proposedChangeSet.findUnique({ where: { id: params.changeSetId } });
  if (!changeSet) {
    return notFound('Proposed change set');
  }

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.proposedChangeSet.update({
      where: { id: params.changeSetId },
      data: {
        reviewStatus: 'rejected',
        notes: reason
      }
    });

    const job = await tx.ingestionJob.findFirst({ where: { sourceDocumentId: changeSet.sourceDocumentId } });
    if (job) {
      await tx.ingestionJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          errorCode: 'operator_rejected',
          errorMessage: reason
        }
      });
    }
  });

  return Response.json({ rejected: true });
}
