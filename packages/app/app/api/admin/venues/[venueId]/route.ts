import { requireRole } from '@/lib/auth-guard';
import { authFailure, err } from '@/lib/api/response';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: { venueId: string } }
) {
  try {
    await requireRole(['operator', 'admin']);
  } catch (error) {
    return authFailure(error);
  }

  const venue = await prisma.venue.findUnique({
    where: { id: params.venueId },
    include: {
      events: {
        orderBy: { startAt: 'desc' },
        take: 10,
        select: { id: true, title: true, startAt: true, endAt: true, publishStatus: true }
      },
      artworks: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          title: true,
          medium: true,
          year: true,
          availability: true,
          imageUrl: true,
          artist: { select: { id: true, name: true } }
        }
      }
    }
  });

  if (!venue) {
    return err('Venue not found', 'NOT_FOUND', 404);
  }

  const domain = venue.domain;
  const extractedArtistCount = domain
    ? await prisma.ingestExtractedArtist.count({
        where: { sourceUrl: { contains: domain } }
      })
    : 0;

  const enrichmentRuns = await prisma.enrichmentRun.findMany({
    where: { entityType: 'Venue', entityId: params.venueId },
    orderBy: { createdAt: 'desc' },
    take: 10
  });

  return Response.json({ venue, extractedArtistCount, enrichmentRuns });
}
