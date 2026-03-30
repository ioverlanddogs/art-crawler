import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  reason: z.string().trim().min(8).max(500),
  confirmText: z.literal('PROMOTE')
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !['ADMIN', 'ANALYST'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { reason } = schema.parse(await request.json());
  const activeConfig = await prisma.pipelineConfigVersion.findFirst({ where: { isActive: true }, orderBy: { version: 'desc' } });
  const promoted = await prisma.$transaction(async (tx) => {
    await tx.modelVersion.updateMany({ data: { isActive: false } });
    const activeModel = await tx.modelVersion.update({
      where: { id: params.id },
      data: { isActive: true, isShadow: false, promotedAt: new Date() }
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
