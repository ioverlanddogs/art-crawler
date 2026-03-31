import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth-guard';
import { authFailure, notFound } from '@/lib/api/response';

export async function GET(_req: Request, context: { params: { id: string } }) {
  try {
    await requireRole(['viewer', 'moderator', 'operator', 'admin']);
  } catch (error) {
    return authFailure(error);
  }

  const job = await prisma.ingestionJob.findUnique({
    where: { id: context.params.id },
    include: {
      sourceDocument: true
    }
  });

  if (!job) {
    return notFound('Ingestion job');
  }

  const [extractionRun, proposedChangeSet] = await Promise.all([
    prisma.extractionRun.findFirst({
      where: { sourceDocumentId: job.sourceDocumentId },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.proposedChangeSet.findFirst({
      where: { sourceDocumentId: job.sourceDocumentId },
      orderBy: { createdAt: 'desc' }
    })
  ]);

  return Response.json({
    ...job,
    extractionRun,
    proposedChangeSet
  });
}
