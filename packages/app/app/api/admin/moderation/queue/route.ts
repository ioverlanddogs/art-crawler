import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { listModerationCandidates } from '@/lib/pipeline/import-service';

export async function GET() {
  const items = await listModerationCandidates(prisma);
  return NextResponse.json({ items });
}
