import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !['ADMIN', 'REVIEWER'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const candidate = await prisma.candidate.update({ where: { id: params.id }, data: { status: 'REJECTED' } });
  await prisma.pipelineTelemetry.create({
    data: {
      stage: 'moderation_reject',
      status: 'success',
      detail: `candidate=${candidate.id}; actor=${session.user.email ?? session.user.id}`,
      configVersion: candidate.configVersion,
      candidateId: candidate.id
    }
  });
  return NextResponse.json(candidate);
}
