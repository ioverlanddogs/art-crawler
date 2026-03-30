import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const candidate = await prisma.candidate.update({ where: { id: params.id }, data: { status: 'APPROVED' } });
  return NextResponse.json(candidate);
}
