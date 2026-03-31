import { PageHeader, SectionCard, StatCard } from '@/components/admin';
import { prisma } from '@/lib/db';
import { filterByScope, resolveScopeContext } from '@/lib/admin/scope';

export const dynamic = 'force-dynamic';

export default async function OperationsPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const scopeContext = resolveScopeContext(searchParams);
  const now = new Date();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [reviewers, openWork, overdueByReviewer, escalationHotspots, resolvedRows, blockerOwners, duplicateOwnership] = await Promise.all([
    prisma.adminUser.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true, email: true } }),
    prisma.proposedChangeSet.groupBy({ by: ['assignedReviewerId'], where: { reviewStatus: { in: ['draft', 'in_review'] } }, _count: { _all: true } }),
    prisma.proposedChangeSet.groupBy({ by: ['assignedReviewerId'], where: { dueAt: { lt: now }, reviewStatus: { in: ['draft', 'in_review'] } }, _count: { _all: true } }),
    prisma.proposedChangeSet.groupBy({ by: ['assignedReviewerId'], where: { escalationLevel: { gt: 0 }, reviewStatus: { in: ['draft', 'in_review'] } }, _count: { _all: true } }),
    prisma.proposedChangeSet.findMany({ where: { reviewedAt: { gte: since7d, not: null }, assignedReviewerId: { not: null } }, select: { assignedReviewerId: true, createdAt: true, reviewedAt: true }, take: 1200 }),
    prisma.event.groupBy({ by: ['assignedReviewerId'], where: { publishStatus: { in: ['ready', 'draft'] }, assignedReviewerId: { not: null } }, _count: { _all: true } }),
    prisma.duplicateCandidate.groupBy({ by: ['assignedReviewerId'], where: { resolutionStatus: 'unresolved' }, _count: { _all: true } })
  ]);

  const nameFor = (id: string | null) => reviewers.find((reviewer) => reviewer.id === id)?.name ?? reviewers.find((reviewer) => reviewer.id === id)?.email ?? id ?? 'unassigned';
  const scopedOpenWork = filterByScope(openWork, scopeContext, (row) => ({ assignedReviewerId: row.assignedReviewerId }));
  const scopedOverdue = filterByScope(overdueByReviewer, scopeContext, (row) => ({ assignedReviewerId: row.assignedReviewerId }));
  const scopedEscalations = filterByScope(escalationHotspots, scopeContext, (row) => ({ assignedReviewerId: row.assignedReviewerId }));
  const scopedBlockers = filterByScope(blockerOwners, scopeContext, (row) => ({ assignedReviewerId: row.assignedReviewerId }));
  const scopedDuplicateOwnership = filterByScope(duplicateOwnership, scopeContext, (row) => ({ assignedReviewerId: row.assignedReviewerId }));
  const avgResolutionMinutes = resolvedRows.length
    ? Math.round(resolvedRows.reduce((acc, row) => acc + ((row.reviewedAt?.getTime() ?? row.createdAt.getTime()) - row.createdAt.getTime()), 0) / Math.max(1, resolvedRows.length) / 60000)
    : 0;

  return (
    <div className="stack">
      <PageHeader title="Reviewer operations" description="Team-level ownership, SLA, and workload balance across moderation queues." />

      <div className="stats-grid">
        <StatCard label="Reviewer queue load" value={scopedOpenWork.reduce((acc, row) => acc + row._count._all, 0)} />
        <StatCard label="Overdue items" value={scopedOverdue.reduce((acc, row) => acc + row._count._all, 0)} />
        <StatCard label="Escalation hotspots" value={scopedEscalations.reduce((acc, row) => acc + row._count._all, 0)} />
        <StatCard label="Avg resolution time" value={`${avgResolutionMinutes}m`} />
      </div>

      <div className="two-col">
        <SectionCard title="Top blocker owners">
          <ul className="timeline">
            {scopedBlockers.sort((a, b) => b._count._all - a._count._all).slice(0, 8).map((row) => (
              <li key={`blocker-${row.assignedReviewerId ?? 'unassigned'}`}>
                <strong>{nameFor(row.assignedReviewerId)}</strong>
                <p className="kpi-note">{row._count._all} publish blockers</p>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="Duplicate queue ownership">
          <ul className="timeline">
            {scopedDuplicateOwnership.sort((a, b) => b._count._all - a._count._all).slice(0, 8).map((row) => (
              <li key={`dup-${row.assignedReviewerId ?? 'unassigned'}`}>
                <strong>{nameFor(row.assignedReviewerId)}</strong>
                <p className="kpi-note">{row._count._all} unresolved duplicate items</p>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
