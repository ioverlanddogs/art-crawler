import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

const schema = z.object({ id: z.string() });

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !['ADMIN', 'ANALYST'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = schema.parse(await req.json());
  await prisma.pipelineConfigVersion.updateMany({ data: { isActive: false } });
  const active = await prisma.pipelineConfigVersion.update({ where: { id }, data: { isActive: true } });
  await prisma.pipelineTelemetry.create({
    data: {
      stage: 'config_activate',
      status: 'success',
      detail: `version=${active.version}; actor=${session.user.email ?? session.user.id}`,
      configVersion: active.version
    }
  });
  return NextResponse.json(active);
}
