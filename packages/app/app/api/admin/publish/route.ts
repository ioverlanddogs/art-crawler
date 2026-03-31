import { NextResponse } from 'next/server';
import { authFailure } from '@/lib/api/response';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireRole(['viewer', 'moderator', 'operator', 'admin']);
  } catch (error) {
    return authFailure(error);
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('pageSize') ?? '20', 10) || 20));

  const [total, events] = await Promise.all([
    prisma.event.count({ where: { publishStatus: 'ready' } }),
    prisma.event.findMany({
      where: { publishStatus: 'ready' },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        proposedChangeSets: {
          where: { reviewStatus: 'approved' },
          orderBy: { reviewedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            reviewedByUserId: true,
            reviewedAt: true,
            sourceDocumentId: true
          }
        }
      }
    })
  ]);

  return NextResponse.json({
    data: events.map((event) => ({
      ...event,
      latestProposedChangeSet: event.proposedChangeSets[0] ?? null
    })),
    meta: {
      page,
      pageSize,
      total
    }
  });
}
