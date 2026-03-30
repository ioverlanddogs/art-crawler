import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const schema = z.object({ id: z.string() });

export async function POST(req: Request) {
  const { id } = schema.parse(await req.json());
  await prisma.pipelineConfigVersion.updateMany({ data: { isActive: false } });
  const active = await prisma.pipelineConfigVersion.update({ where: { id }, data: { isActive: true } });
  return NextResponse.json(active);
}
