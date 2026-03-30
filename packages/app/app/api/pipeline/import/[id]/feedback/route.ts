import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const schema = z.object({ candidateId: z.string(), label: z.enum(['APPROVED', 'REJECTED']) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = schema.parse(await req.json());
  await prisma.pipelineTelemetry.create({
    data: {
      stage: 'feedback',
      status: 'success',
      detail: `label=${body.label};batch=${params.id}`,
      configVersion: 0,
      candidateId: body.candidateId
    }
  });
  return NextResponse.json({ ok: true });
}
