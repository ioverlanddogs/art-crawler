import { prisma } from '@/lib/db';
import { isPipelineImportAuthorized } from '@/lib/pipeline/import-auth';
import { err, notFound, ok } from '@/lib/api/response';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!isPipelineImportAuthorized(req)) return err('Unauthorized', 'UNAUTHORIZED', 401);

  const batch = await prisma.importBatch.findUnique({ where: { id: params.id } });
  if (!batch) return notFound('Import batch');

  const events = await prisma.ingestExtractedEvent.findMany({
    where: { importBatchId: params.id },
    select: {
      id: true,
      title: true,
      status: true,
      moderatedAt: true,
      moderatedBy: true,
      rejectionReason: true
    }
  });

  return ok({ importBatchId: params.id, decisions: events });
}
