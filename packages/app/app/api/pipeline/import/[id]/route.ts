import { prisma } from '@/lib/db';
import { err, notFound, ok } from '@/lib/api/response';

function isAuthorized(req: Request): boolean {
  const auth = req.headers.get('authorization');
  return auth === `Bearer ${process.env.MINING_SERVICE_SECRET}`;
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (!isAuthorized(req)) return err('Unauthorized', 'UNAUTHORIZED', 401);

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
