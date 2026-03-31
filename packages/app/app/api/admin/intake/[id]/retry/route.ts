import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth-guard';
import { authFailure, err, notFound } from '@/lib/api/response';

export async function POST(_req: Request, context: { params: { id: string } }) {
  try {
    await requireRole(['operator', 'admin']);
  } catch (error) {
    return authFailure(error);
  }

  const existing = await prisma.ingestionJob.findUnique({ where: { id: context.params.id } });

  if (!existing) {
    return notFound('Ingestion job');
  }

  if (existing.status !== 'failed') {
    return err('Job is not retryable', 'NOT_RETRYABLE', 400);
  }

  await prisma.ingestionJob.update({
    where: { id: existing.id },
    data: {
      status: 'queued',
      errorCode: null,
      errorMessage: null,
      startedAt: new Date()
    }
  });

  return Response.json({ queued: true });
}
