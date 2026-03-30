import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const rejectSchema = z.object({
  expectedStatus: z.enum(['PENDING']).optional(),
  reason: z.string().trim().min(3).max(500).optional()
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !['ADMIN', 'REVIEWER'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = rejectSchema.parse(await request.json().catch(() => ({})));
  const candidate = await prisma.candidate.findUnique({ where: { id: params.id } });
  if (!candidate) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (body.expectedStatus && candidate.status !== body.expectedStatus) {
    return NextResponse.json({ error: `Conflict: expected ${body.expectedStatus} but candidate is ${candidate.status}` }, { status: 409 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const rejected = await tx.candidate.update({ where: { id: params.id }, data: { status: 'REJECTED' } });
    await tx.pipelineTelemetry.create({
      data: {
        stage: 'moderation_reject',
        status: 'success',
        detail: `candidate=${rejected.id}; actor=${session.user.email ?? session.user.id}${body.reason ? `; reason=${body.reason}` : ''}`,
        configVersion: rejected.configVersion,
        candidateId: rejected.id
      }
    });
    return rejected;
  });

  return NextResponse.json(updated);
}
