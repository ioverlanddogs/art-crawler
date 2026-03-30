import { NextResponse } from 'next/server';
import { authFailure } from '@/lib/api/response';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireRole(['moderator', 'operator', 'admin']);
  } catch (error) {
    return authFailure(error);
  }

  const items = await prisma.ingestExtractedEvent.findMany({
    where: { status: 'PENDING' },
    orderBy: [{ confidenceScore: 'desc' }, { createdAt: 'desc' }],
    take: 100
  });
  return NextResponse.json({ items });
}
