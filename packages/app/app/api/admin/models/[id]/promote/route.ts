import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !['ADMIN', 'ANALYST'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  await prisma.modelVersion.updateMany({ data: { isActive: false } });
  const promoted = await prisma.modelVersion.update({ where: { id: params.id }, data: { isActive: true, isShadow: false, promotedAt: new Date() } });
  const activeConfig = await prisma.pipelineConfigVersion.findFirst({ where: { isActive: true }, orderBy: { version: 'desc' } });
  await prisma.pipelineTelemetry.create({
    data: {
      stage: 'model_promote',
      status: 'success',
      detail: `model=${promoted.name}@${promoted.version}; actor=${session.user.email ?? session.user.id}`,
      configVersion: activeConfig?.version ?? 0
    }
  });
  return NextResponse.json(promoted);
}
