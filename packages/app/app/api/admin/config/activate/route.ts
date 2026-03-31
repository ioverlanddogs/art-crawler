import { NextResponse } from 'next/server';
import type { Prisma } from '@/generated/prisma';
import { z } from 'zod';
import { authFailure } from '@/lib/api/response';
import { requireRole } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  id: z.string(),
  reason: z.string().trim().min(8).max(500),
  confirmText: z.literal('ACTIVATE')
});

export async function POST(req: Request) {
  let session;
  try {
    session = await requireRole(['operator', 'admin']);
  } catch (error) {
    return authFailure(error);
  }

  const { id, reason } = schema.parse(await req.json());
  const target = await prisma.pipelineConfigVersion.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: 'Pipeline config version not found' }, { status: 404 });
  }

  const active = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.pipelineConfigVersion.updateMany({
      where: { region: target.region, status: 'ACTIVE', id: { not: id } },
      data: { status: 'ARCHIVED' }
    });
    const nextActive = await tx.pipelineConfigVersion.update({
      where: { id },
      data: { status: 'ACTIVE', activatedAt: new Date(), activatedBy: session.user.id, changeReason: reason }
    });

    await tx.pipelineTelemetry.create({
      data: {
        stage: 'config_activate',
        status: 'success',
        detail: `version=${nextActive.version}; actor=${session.user.email ?? session.user.id}; reason=${reason}`,
        configVersion: nextActive.version
      }
    });

    return nextActive;
  });

  return NextResponse.json(active);
}
