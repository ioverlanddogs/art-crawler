import { requireRole } from '@/lib/auth-guard';
import { authFailure } from '@/lib/api/response';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    await requireRole(['operator', 'admin']);
  } catch (error) {
    return authFailure(error);
  }

  const url = new URL(req.url);
  const region = url.searchParams.get('region');
  const take = Math.min(Number(url.searchParams.get('take') ?? '50'), 100);

  const venues = await prisma.venue.findMany({
    where: region ? { region: { contains: region, mode: 'insensitive' } } : undefined,
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      id: true,
      name: true,
      slug: true,
      domain: true,
      region: true,
      address: true,
      websiteUrl: true,
      imageUrl: true,
      bio: true,
      openingHours: true,
      createdAt: true,
      _count: {
        select: {
          events: true,
          artworks: true
        }
      }
    }
  });

  return Response.json({ venues, total: venues.length });
}
