import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireRole(['moderator', 'operator', 'admin']);
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: error.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: error.status });
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const items = await prisma.ingestExtractedEvent.findMany({
    where: { status: 'PENDING' },
    orderBy: [{ confidenceScore: 'desc' }, { createdAt: 'desc' }],
    take: 100
  });
  return NextResponse.json({ items });
}
