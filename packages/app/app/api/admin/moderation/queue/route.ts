import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const items = await prisma.ingestExtractedEvent.findMany({
    where: { status: 'PENDING' },
    orderBy: [{ confidenceScore: 'desc' }, { createdAt: 'desc' }],
    take: 100
  });
  return NextResponse.json({ items });
}
