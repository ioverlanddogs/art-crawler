import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth-guard';
import { forbidden, notFound, ok } from '@/lib/api/response';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole(['viewer', 'moderator', 'operator', 'admin']);
  } catch {
    return forbidden();
  }

  const record = await prisma.ingestExtractedEvent.findUnique({
    where: { id: params.id },
    include: { venue: true, ingestRun: true }
  });

  if (!record) return notFound('Event candidate');

  const cluster = record.clusterKey
    ? await prisma.ingestExtractedEvent.findMany({
        where: { clusterKey: record.clusterKey, NOT: { id: record.id } },
        orderBy: { confidenceScore: 'desc' }
      })
    : [];

  return ok({ ...record, cluster });
}
