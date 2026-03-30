import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth-guard';
import { err, forbidden, ok } from '@/lib/api/response';

export async function POST(_: Request, { params }: { params: { id: string } }) {
  let session;
  try {
    session = await requireRole(['moderator', 'operator', 'admin']);
  } catch {
    return forbidden();
  }

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.ingestExtractedEvent.findUnique({ where: { id: params.id } });
    if (!existing) return null;

    const updated = await tx.ingestExtractedEvent.update({
      where: { id: params.id },
      data: {
        status: 'APPROVED',
        moderatedBy: session.user.id,
        moderatedAt: new Date(),
        rejectionReason: null
      }
    });

    await tx.pipelineTelemetry.create({
      data: {
        stage: 'moderation_approve',
        status: 'success',
        detail: 'Approved by admin API',
        entityId: updated.id,
        entityType: 'event',
        configVersion: updated.configVersion
      }
    });

    return updated;
  });

  if (!result) return err('Event candidate not found', 'NOT_FOUND', 404);
  return ok(result);
}
