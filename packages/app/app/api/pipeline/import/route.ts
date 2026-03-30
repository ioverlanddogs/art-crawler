import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { processImportBatch } from '@/lib/pipeline/import-service';

export async function POST(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.MINING_IMPORT_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await processImportBatch(prisma, await req.json());
  return NextResponse.json(result);
}
