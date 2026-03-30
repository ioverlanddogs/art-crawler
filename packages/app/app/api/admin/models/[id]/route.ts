import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  return NextResponse.json(await prisma.modelVersion.findUnique({ where: { id: params.id } }));
}
