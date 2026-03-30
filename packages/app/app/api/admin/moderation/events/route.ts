import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth-guard';
import { authFailure, ok } from '@/lib/api/response';
import { parsePagination } from '@/lib/api/pagination';

export async function GET(req: Request) {
  try {
    await requireRole(['viewer', 'moderator', 'operator', 'admin']);
  } catch (error) {
    return authFailure(error);
  }

  const url = new URL(req.url);
  const { page, pageSize, skip, take } = parsePagination(url.searchParams);
  const band = url.searchParams.get('band') ?? undefined;
  const status = url.searchParams.get('status') ?? undefined;
  const source = url.searchParams.get('source') ?? undefined;
  const region = url.searchParams.get('region') ?? undefined;
  const venueId = url.searchParams.get('venueId') ?? undefined;
  const importBatchId = url.searchParams.get('importBatchId') ?? undefined;
  const search = url.searchParams.get('search') ?? undefined;
  const autoApproved = url.searchParams.get('autoApproved');
  const sort = url.searchParams.get('sort') ?? 'createdAt';
  const order = url.searchParams.get('order') === 'asc' ? 'asc' : 'desc';

  const where = {
    ...(band ? { confidenceBand: band } : {}),
    ...(status ? { status } : {}),
    ...(source ? { source } : {}),
    ...(region ? { region } : {}),
    ...(venueId ? { venueId } : {}),
    ...(importBatchId ? { importBatchId } : {}),
    ...(autoApproved ? { autoApproved: autoApproved === 'true' } : {}),
    ...(search ? { title: { contains: search, mode: 'insensitive' as const } } : {})
  };

  const [total, data] = await Promise.all([
    prisma.ingestExtractedEvent.count({ where }),
    prisma.ingestExtractedEvent.findMany({
      where,
      skip,
      take,
      orderBy: { [sort]: order },
      include: { venue: true }
    })
  ]);

  return ok(data, { page, pageSize, total });
}
