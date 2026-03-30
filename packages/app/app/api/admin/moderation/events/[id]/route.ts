import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth-guard';
import { authFailure, notFound, ok } from '@/lib/api/response';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole(['viewer', 'moderator', 'operator', 'admin']);
  } catch (error) {
    return authFailure(error);
  }

  const record = await prisma.ingestExtractedEvent.findUnique({
    where: { id: params.id },
    include: { venue: true, ingestRun: true }
  });

  if (!record) return notFound('Event candidate');

  const [cluster, moderationHistory] = await Promise.all([
    record.clusterKey
      ? prisma.ingestExtractedEvent.findMany({
          where: { clusterKey: record.clusterKey, NOT: { id: record.id } },
          orderBy: { confidenceScore: 'desc' }
        })
      : Promise.resolve([]),
    prisma.pipelineTelemetry.findMany({
      where: {
        entityId: record.id,
        stage: { startsWith: 'moderation_' }
      },
      orderBy: { createdAt: 'desc' },
      take: 12
    })
  ]);

  return ok({ ...record, cluster, moderationHistory });
}
