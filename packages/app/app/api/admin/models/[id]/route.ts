import { NextResponse } from 'next/server';
import { authFailure } from '@/lib/api/response';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth-guard';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole(['operator', 'admin']);
  } catch (error) {
    return authFailure(error);
  }

  return NextResponse.json(await prisma.modelVersion.findUnique({ where: { id: params.id } }));
}
