import { authFailure } from '@/lib/api/response';
import { requireRole } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  try {
    await requireRole(['moderator', 'operator', 'admin']);
  } catch (error) {
    return authFailure(error);
  }

  const { searchParams } = new URL(request.url);
  const filter = searchParams.get('filter');

  const where: Record<string, unknown> = {};
  if (filter === 'high-confidence') where.matchConfidence = { gte: 0.8 };
  if (filter === 'conflicting-values') where.conflictingSourceCount = { gt: 0 };
  if (filter === 'uncorroborated') where.corroborationSourceCount = { lt: 1 };
  if (filter === 'publish-blocked') where.unresolvedBlockerCount = { gt: 0 };

  const rows = await prisma.duplicateCandidate.findMany({
    where: { resolutionStatus: 'unresolved', ...where },
    include: {
      proposedChangeSet: {
        select: {
          id: true,
          sourceDocumentId: true,
          reviewStatus: true
        }
      },
      canonicalEvent: {
        select: { id: true, title: true, startAt: true }
      }
    },
    orderBy: [{ unresolvedBlockerCount: 'desc' }, { matchConfidence: 'desc' }, { updatedAt: 'desc' }],
    take: 300
  });

  return Response.json({ data: rows });
}
