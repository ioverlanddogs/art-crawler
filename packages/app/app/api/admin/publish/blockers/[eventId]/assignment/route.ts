import { authFailure, err, notFound } from '@/lib/api/response';
import { requireRole } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { calculateSlaState, defaultDueAt, snoozeDueAt } from '@/lib/admin/assignment-sla';

export async function PATCH(request: Request, { params }: { params: { eventId: string } }) {
  let session;
  try {
    session = await requireRole(['moderator', 'operator', 'admin']);
  } catch (error) {
    return authFailure(error);
  }

  const payload = await request.json().catch(() => null) as { action?: string; reviewerId?: string; snoozeHours?: number } | null;
  const current = await prisma.event.findUnique({ where: { id: params.eventId } });
  if (!current) return notFound('Event');

  const action = payload?.action;
  const now = new Date();
  let data: Record<string, unknown> = {};

  if (action === 'claim' || action === 'assign' || action === 'reassign') {
    const reviewerId = action === 'claim' ? session.user.id : payload?.reviewerId;
    if (!reviewerId) return err('reviewerId is required', 'INVALID_ASSIGNMENT', 400);
    data = { assignedReviewerId: reviewerId, assignedAt: now, dueAt: current.dueAt ?? defaultDueAt(8, now), escalationLevel: 0, slaState: 'assigned' };
  } else if (action === 'escalate') {
    data = { escalationLevel: (current.escalationLevel ?? 0) + 1, slaState: 'escalated' };
  } else if (action === 'snooze') {
    data = { dueAt: snoozeDueAt(current.dueAt, payload?.snoozeHours ?? 1, now) };
  } else if (action === 'start') {
    data = { slaState: 'in_progress' };
  } else {
    return err('Unsupported assignment action', 'INVALID_ASSIGNMENT_ACTION', 400);
  }

  const slaState = calculateSlaState({ assignedReviewerId: (data.assignedReviewerId as string | undefined) ?? current.assignedReviewerId, dueAt: (data.dueAt as Date | undefined) ?? current.dueAt, escalationLevel: (data.escalationLevel as number | undefined) ?? current.escalationLevel, slaState: (data.slaState as any) ?? current.slaState }, now);
  const updated = await prisma.event.update({ where: { id: params.eventId }, data: { ...data, slaState } });

  await prisma.pipelineTelemetry.create({ data: { stage: 'assignment', status: 'success', detail: `publish-blocker:${action}`, entityType: 'Event', entityId: updated.id, metadata: { actorId: session.user.id, action, assignedReviewerId: updated.assignedReviewerId, escalationLevel: updated.escalationLevel } } });

  return Response.json({ data: updated });
}
