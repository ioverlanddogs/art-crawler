import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const batch = await prisma.importBatch.findUnique({ where: { id: params.id } });
  if (!batch) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const count = await prisma.candidate.count({ where: { importBatchId: params.id } });
  return NextResponse.json({ ...batch, candidateCount: count });
}
