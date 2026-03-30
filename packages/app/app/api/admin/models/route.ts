import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth-guard';

export async function GET() {
  try {
    await requireRole(['operator', 'admin']);
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: error.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: error.status });
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json(await prisma.modelVersion.findMany({ orderBy: { createdAt: 'desc' } }));
}
