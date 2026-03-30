import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth-guard';
import { err, forbidden, ok } from '@/lib/api/response';

const schema = z.object({
  reason: z.string().optional(),
  expectedStatus: z.enum(['PENDING']).optional()
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  let session;
  try {
    session = await requireRole(['moderator', 'operator', 'admin']);
  } catch {
    return forbidden();
  }

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return err('Invalid payload', 'VALIDATION_ERROR', 400);

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.ingestExtractedEvent.findUnique({ where: { id: params.id } });
    if (!existing) return { kind: 'missing' as const };

    if (parsed.data.expectedStatus && existing.status !== parsed.data.expectedStatus) {
      return { kind: 'conflict' as const };
    }

    const updated = await tx.ingestExtractedEvent.update({
      where: { id: params.id },
      data: {
        status: 'REJECTED',
        moderatedBy: session.user.id,
        moderatedAt: new Date(),
        rejectionReason: parsed.data.reason ?? null
      }
    });

    await tx.pipelineTelemetry.create({
      data: {
        stage: 'moderation_reject',
        status: 'success',
        detail: parsed.data.reason ?? 'Rejected',
        entityId: updated.id,
        entityType: 'event',
        configVersion: updated.configVersion
      }
    });

    return { kind: 'ok' as const, updated };
  });

  if (result.kind === 'missing') return err('Event candidate not found', 'NOT_FOUND', 404);
  if (result.kind === 'conflict') return err('Expected status mismatch', 'CONFLICT', 409);
  return ok(result.updated);
}
