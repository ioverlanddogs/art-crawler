import { prisma } from '@/lib/db';
import { err, notFound, ok } from '@/lib/api/response';

function isAuthorized(req: Request): boolean {
  const auth = req.headers.get('authorization');
  return auth === `Bearer ${process.env.MINING_SERVICE_SECRET}`;
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!isAuthorized(req)) return err('Unauthorized', 'UNAUTHORIZED', 401);

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
