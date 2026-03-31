import { authFailure } from '@/lib/api/response';
import { requireRole } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { checkPublishReadiness } from '@/lib/intake/publish-gate';
import { groupByKey } from '@/lib/admin/batch-workflows';

export async function GET() {
  try {
    await requireRole(['viewer', 'moderator', 'operator', 'admin']);
  } catch (error) {
    return authFailure(error);
  }

  const events = await prisma.event.findMany({
    where: { publishStatus: { in: ['ready', 'draft'] } },
    include: {
      proposedChangeSets: {
        where: { reviewStatus: 'approved' },
        orderBy: { reviewedAt: 'desc' },
        take: 1,
        include: { fieldReviews: true, duplicateCandidates: true }
      }
    },
    take: 200
  });

  const blocked = events
    .map((event) => {
      const latest = event.proposedChangeSets[0];
      const readiness = latest
        ? checkPublishReadiness({
            proposedDataJson: asRecord(latest.proposedDataJson),
            fieldReviews: latest.fieldReviews,
            duplicateCandidates: latest.duplicateCandidates
          })
        : { ready: false, blockers: ['No approved change set'], warnings: [] };
      return { eventId: event.id, title: event.title, blockers: readiness.blockers, ready: readiness.ready };
    })
    .filter((row) => !row.ready);

  const clusters = groupByKey(blocked, (row) => row.blockers[0] ?? 'unknown blocker').map((group) => ({
    blocker: group.key,
    count: group.count,
    eventIds: group.records.map((record) => record.eventId)
  }));

  return Response.json({ data: blocked, clusters });
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
