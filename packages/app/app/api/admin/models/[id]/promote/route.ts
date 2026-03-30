import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(_: Request, { params }: { params: { id: string } }) {
  await prisma.modelVersion.updateMany({ data: { isActive: false } });
  const promoted = await prisma.modelVersion.update({ where: { id: params.id }, data: { isActive: true, isShadow: false, promotedAt: new Date() } });
  return NextResponse.json(promoted);
}
