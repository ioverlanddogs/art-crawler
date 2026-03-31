import { z } from 'zod';
import { authFailure, err } from '@/lib/api/response';
import { requireRole } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';

const schema = z.object({
  candidateIds: z.array(z.string().min(1)).min(1).max(200),
  resolutionStatus: z.enum(['false_positive', 'resolved_separate', 'escalated']),
  reviewerNote: z.string().max(1000).optional()
});

export async function POST(request: Request) {
  let session;
  try {
    session = await requireRole(['moderator', 'operator', 'admin']);
  } catch (error) {
    return authFailure(error);
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return err('Invalid payload', 'VALIDATION_ERROR', 400);

  const now = new Date();
  const updated = await prisma.duplicateCandidate.updateMany({
    where: { id: { in: parsed.data.candidateIds } },
    data: {
      resolutionStatus: parsed.data.resolutionStatus,
      reviewerNote: parsed.data.reviewerNote ?? null,
      resolvedByUserId: session.user.id,
      resolvedAt: now
    }
  });

  await prisma.pipelineTelemetry.create({
    data: {
      stage: 'duplicate_batch_resolution',
      status: 'success',
      entityType: 'DuplicateCandidate',
      entityId: null,
      detail: `Batch duplicate resolution: ${parsed.data.resolutionStatus}`,
      metadata: {
        candidateIds: parsed.data.candidateIds,
        resolutionStatus: parsed.data.resolutionStatus,
        reviewerNote: parsed.data.reviewerNote ?? null,
        resolvedByUserId: session.user.id
      }
    }
  });

  return Response.json({ updated: updated.count, resolutionStatus: parsed.data.resolutionStatus });
}
