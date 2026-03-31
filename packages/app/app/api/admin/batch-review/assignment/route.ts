import { authFailure, err } from '@/lib/api/response';
import { requireRole } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { defaultDueAt } from '@/lib/admin/assignment-sla';

export async function POST(request: Request) {
  let session;
  try {
    session = await requireRole(['moderator', 'operator', 'admin']);
  } catch (error) {
    return authFailure(error);
  }

  const payload = await request.json().catch(() => null) as { changeSetIds?: string[]; reviewerId?: string } | null;
  if (!payload?.changeSetIds?.length || !payload.reviewerId) {
    return err('changeSetIds and reviewerId are required', 'INVALID_BATCH_ASSIGNMENT', 400);
  }

  const now = new Date();
  const result = await prisma.proposedChangeSet.updateMany({
    where: { id: { in: payload.changeSetIds } },
    data: {
      assignedReviewerId: payload.reviewerId,
      assignedAt: now,
      escalationLevel: 0,
      dueAt: defaultDueAt(24, now),
      slaState: 'assigned'
    }
  });

  await prisma.pipelineTelemetry.create({
    data: {
      stage: 'assignment',
      status: 'success',
      detail: 'batch-review:assign',
      entityType: 'ProposedChangeSet',
      metadata: { actorId: session.user.id, reviewerId: payload.reviewerId, count: result.count }
    }
  });

  return Response.json({ updated: result.count });
}
