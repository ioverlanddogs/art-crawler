import Link from 'next/link';
import { EmptyState, PageHeader, SectionCard } from '@/components/admin';
import { AssignmentControls } from '@/components/admin/AssignmentControls';
import { requireRole } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { groupByKey } from '@/lib/admin/batch-workflows';
import { filterByScope, resolveScopeContext, withScopeQuery } from '@/lib/admin/scope';

export const dynamic = 'force-dynamic';

const FILTERS = ['high-confidence', 'conflicting-values', 'uncorroborated', 'publish-blocked'] as const;

export default async function DuplicateQueuePage({
  searchParams
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  await requireRole(['viewer', 'moderator', 'operator', 'admin']);
  const scopeContext = resolveScopeContext(searchParams);
  const activeFilter = asString(searchParams?.filter);
  const where: Record<string, unknown> = { resolutionStatus: 'unresolved' };
  if (activeFilter === 'high-confidence') where.matchConfidence = { gte: 0.8 };
  if (activeFilter === 'conflicting-values') where.conflictingSourceCount = { gt: 0 };
  if (activeFilter === 'uncorroborated') where.corroborationSourceCount = { lt: 1 };
  if (activeFilter === 'publish-blocked') where.unresolvedBlockerCount = { gt: 0 };

  const [candidates, reviewers] = await Promise.all([
    prisma.duplicateCandidate.findMany({
    where,
    include: {
      proposedChangeSet: { select: { id: true, reviewStatus: true, sourceDocument: { select: { sourceUrl: true, sourceType: true } } } },
      canonicalEvent: { select: { id: true, title: true } }
    },
    orderBy: [{ unresolvedBlockerCount: 'desc' }, { matchConfidence: 'desc' }, { updatedAt: 'desc' }],
    take: 300
    }),
    prisma.adminUser.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true, email: true }, orderBy: { email: 'asc' }, take: 100 })
  ]);

  const scopedCandidates = filterByScope(candidates, scopeContext, (row) => ({
    assignedReviewerId: row.assignedReviewerId,
    sourceGroup: row.source ?? null,
    sourceType: row.proposedChangeSet?.sourceDocument?.sourceType ?? null
  }));
  const byHotspot = groupByKey(scopedCandidates, (row) => row.source ?? 'unknown');
  const byCanonical = groupByKey(scopedCandidates, (row) => row.canonicalEventId ?? 'none');
  const byConflict = groupByKey(scopedCandidates, (row) =>
    row.unresolvedBlockerCount > 0 ? 'publish-blocker' : row.conflictingSourceCount > 0 ? 'conflicting-values' : 'low-corroboration'
  );

  return (
    <div className="stack">
      <PageHeader title="Duplicate candidate queue" description="Resolve duplicate + corroboration risks before publish." />

      <SectionCard title="Queue filters">
        <div className="filters-row">
          <Link href={withScopeQuery('/duplicates', scopeContext.scope)} className={`action-button ${!activeFilter ? 'variant-primary' : 'variant-secondary'}`}>All unresolved</Link>
          {FILTERS.map((filter) => (
            <Link key={filter} href={withScopeQuery(`/duplicates?filter=${filter}`, scopeContext.scope)} className={`action-button ${activeFilter === filter ? 'variant-primary' : 'variant-secondary'}`}>
              {filter}
            </Link>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Grouped duplicate triage" subtitle="Batch triage by hotspot source, canonical target, and conflict type.">
        <div className="three-col">
          <GroupList title="Hotspot source" groups={byHotspot} />
          <GroupList title="Canonical target" groups={byCanonical} />
          <GroupList title="Conflict type" groups={byConflict} />
        </div>
        <div className="filters-row" style={{ marginTop: 12 }}>
          <button className="action-button variant-secondary" type="button">Bulk false-positive</button>
          <button className="action-button variant-secondary" type="button">Bulk separate-record</button>
          <button className="action-button variant-primary" type="button">Bulk defer</button>
        </div>
      </SectionCard>

      <SectionCard title="Unresolved duplicate candidates" subtitle="Candidates here block publish if unresolved blockers/conflicts remain.">
        {scopedCandidates.length === 0 ? (
          <EmptyState title="No unresolved candidates" description="Duplicate blockers are currently clear." />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Match confidence</th>
                <th>Record/source</th>
                <th>Canonical suggestion</th>
                <th>Blockers</th>
                <th>Corroboration</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {scopedCandidates.map((row) => (
                <tr key={row.id}>
                  <td><code>{row.id}</code></td>
                  <td>{Math.round(row.matchConfidence * 100)}%</td>
                  <td>{row.recordType} · {row.source ?? 'unknown'}</td>
                  <td>{row.canonicalEvent ? `${row.canonicalEvent.title} (${row.canonicalEvent.id})` : 'No canonical target'}</td>
                  <td>{row.unresolvedBlockerCount}</td>
                  <td>{row.corroborationSourceCount} src · {Math.round(row.corroborationConfidence * 100)}%</td>
                  <td>
                    <div className="filters-row">
                      <Link href={withScopeQuery(`/duplicates/${row.id}`, scopeContext.scope)} className="action-button variant-primary">Open compare</Link>
                      <AssignmentControls endpoint={`/api/admin/duplicates/${row.id}/assignment`} reviewers={reviewers} currentAssigneeId={row.assignedReviewerId} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </div>
  );
}

function GroupList({ title, groups }: { title: string; groups: Array<{ key: string; count: number }> }) {
  return (
    <article>
      <h3>{title}</h3>
      <ul className="timeline">
        {groups.slice(0, 8).map((group) => (
          <li key={`${title}-${group.key}`}>
            <strong>{group.key}</strong>
            <p className="kpi-note">{group.count} candidates</p>
          </li>
        ))}
      </ul>
    </article>
  );
}

function asString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
