import { requireRole } from '@/lib/auth-guard';
import { authFailure, notFound } from '@/lib/api/response';
import { prisma } from '@/lib/db';

export async function POST(request: Request, { params }: { params: { changeSetId: string } }) {
  try {
    await requireRole(['operator', 'admin']);
  } catch (error) {
    return authFailure(error);
  }

  const requestBody = await request.json().catch(() => ({}));
  const note = typeof requestBody?.note === 'string' ? requestBody.note.trim() : '';

  const changeSet = await prisma.proposedChangeSet.findUnique({ where: { id: params.changeSetId } });
  if (!changeSet) {
    return notFound('Proposed change set');
  }

  const ingestionJob = await prisma.ingestionJob.findFirst({
    where: { sourceDocumentId: changeSet.sourceDocumentId },
    orderBy: { createdAt: 'desc' }
  });

  if (!ingestionJob) {
    return notFound('Ingestion job');
  }

  await prisma.$transaction([
    prisma.ingestionJob.update({
      where: { id: ingestionJob.id },
      data: {
        status: 'queued',
        errorCode: null,
        errorMessage: null,
        startedAt: null,
        completedAt: null
      }
    }),
    prisma.proposedChangeSet.update({
      where: { id: changeSet.id },
      data: {
        reviewStatus: 'draft',
        notes: `${changeSet.notes ? `${changeSet.notes}\n` : ''}[reparse-requested] ${new Date().toISOString()}${note ? ` — ${note}` : ''}`
      }
    })
  ]);

  return Response.json({ queued: true, ingestionJobId: ingestionJob.id });
}
