import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  const setting = await prisma.siteSetting.findUnique({ where: { key: 'mining_import_enabled' } });
  if (setting?.value !== 'true') return NextResponse.json({ items: [] });
  const items = await prisma.candidate.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'desc' } });
  return NextResponse.json({ items });
}
