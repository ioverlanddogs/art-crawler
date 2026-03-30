import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  id: z.string(),
  reason: z.string().trim().min(8).max(500),
  confirmText: z.literal('ACTIVATE')
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !['ADMIN', 'ANALYST'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id, reason } = schema.parse(await req.json());
  const active = await prisma.$transaction(async (tx) => {
    await tx.pipelineConfigVersion.updateMany({ data: { isActive: false } });
    const nextActive = await tx.pipelineConfigVersion.update({ where: { id }, data: { isActive: true } });
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
