import { prisma } from '@/lib/db';
import { isPipelineImportAuthorized } from '@/lib/pipeline/import-auth';
import { err, notFound, ok } from '@/lib/api/response';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (!isPipelineImportAuthorized(req)) return err('Unauthorized', 'UNAUTHORIZED', 401);

  const batch = await prisma.importBatch.findUnique({
    where: { id: params.id },
    include: { events: true }
  });

  if (!batch) return notFound('Import batch');

  return ok({
    id: batch.id,
    source: batch.source,
    region: batch.region,
    status: batch.status,
    importedCount: batch.importedCount,
    skippedCount: batch.skippedCount,
    errorCount: batch.errorCount,
    createdAt: batch.createdAt,
    eventCount: batch.events.length
  });
}
