import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { listModerationCandidates } from '@/lib/pipeline/import-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const items = await listModerationCandidates(prisma);
  return NextResponse.json({ items });
}
