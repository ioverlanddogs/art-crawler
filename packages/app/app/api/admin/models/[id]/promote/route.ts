import { NextResponse } from 'next/server';
import type { Prisma } from '@/generated/prisma';
import { z } from 'zod';
import { authFailure } from '@/lib/api/response';
import { requireRole } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  reason: z.string().trim().min(8).max(500),
  confirmText: z.literal('PROMOTE')
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  let session;
  try {
    session = await requireRole(['operator', 'admin']);
  } catch (error) {
    return authFailure(error);
  }
  const { reason } = schema.parse(await request.json());
  const activeConfig = await prisma.pipelineConfigVersion.findFirst({ where: { status: 'ACTIVE' }, orderBy: { version: 'desc' } });
  const promoted = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.modelVersion.updateMany({ where: { status: 'ACTIVE' }, data: { status: 'ARCHIVED' } });
    const activeModel = await tx.modelVersion.update({
      where: { id: params.id },
      data: { status: 'ACTIVE', promotedAt: new Date(), promotedBy: session.user.id }
    });
    await tx.pipelineTelemetry.create({
      data: {
        stage: 'model_promote',
        status: 'success',
        detail: `model=${activeModel.name}@${activeModel.version}; actor=${session.user.email ?? session.user.id}; reason=${reason}`,
        configVersion: activeConfig?.version ?? 0
      }
    });
    return activeModel;
  });
  return NextResponse.json(promoted);
}
