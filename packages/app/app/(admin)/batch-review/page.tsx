import Link from 'next/link';
import { EmptyState, PageHeader, SectionCard } from '@/components/admin';
import { prisma } from '@/lib/db';
import { groupByKey } from '@/lib/admin/batch-workflows';

export const dynamic = 'force-dynamic';

const FILTERS = ['duplicate-blocked', 'publish-blocked', 'low-confidence', 'stale'] as const;

export default async function BatchReviewPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const activeFilter = asString(searchParams?.filter);
  const rows = await prisma.proposedChangeSet.findMany({
    include: {
      sourceDocument: { select: { sourceUrl: true } },
      duplicateCandidates: { select: { resolutionStatus: true, unresolvedBlockerCount: true } },
      fieldReviews: { select: { confidence: true } }
    },
    orderBy: { createdAt: 'desc' },
    take: 300
  });

  const filtered = rows.filter((row) => {
    const unresolvedDupes = row.duplicateCandidates.some((candidate) => candidate.resolutionStatus === 'unresolved' || candidate.unresolvedBlockerCount > 0);
    const lowConfidence = row.fieldReviews.some((review) => (review.confidence ?? 1) < 0.75);
    const stale = Date.now() - row.createdAt.getTime() > 72 * 60 * 60 * 1000;

    if (activeFilter === 'duplicate-blocked') return unresolvedDupes;
    if (activeFilter === 'publish-blocked') return unresolvedDupes || lowConfidence;
    if (activeFilter === 'low-confidence') return lowConfidence;
    if (activeFilter === 'stale') return stale;
    return true;
  });

  const grouped = groupByKey(filtered, (row) => row.reviewStatus);

  return (
    <div className="stack">
      <PageHeader title="Batch review queue" description="Grouped change sets for bulk assignment, safe-field approvals, duplicate triage, and escalation." />

      <SectionCard title="Filters">
        <div className="filters-row">
          <Link href="/batch-review" className={`action-button ${!activeFilter ? 'variant-primary' : 'variant-secondary'}`}>All</Link>
          {FILTERS.map((filter) => (
            <Link key={filter} href={`/batch-review?filter=${filter}`} className={`action-button ${activeFilter === filter ? 'variant-primary' : 'variant-secondary'}`}>
              {filter}
            </Link>
          ))}
        </div>
      </SectionCard>

      {grouped.length === 0 ? (
        <EmptyState title="No queued change sets" description="No change sets matched the selected filters." />
      ) : (
        grouped.map((group) => (
          <SectionCard key={group.key} title={`Status: ${group.key}`} subtitle={`${group.count} change sets`}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Change set</th>
                  <th>Source URL</th>
                  <th>Created</th>
                  <th>Bulk actions</th>
                </tr>
              </thead>
              <tbody>
                {group.records.slice(0, 30).map((row) => (
                  <tr key={row.id}>
                    <td><code>{row.id}</code></td>
                    <td>{row.sourceDocument.sourceUrl}</td>
                    <td>{row.createdAt.toLocaleString()}</td>
                    <td>
                      <div className="filters-row">
                        <Link className="action-button variant-secondary" href={`/workbench/${row.id}`}>Assign</Link>
                        <Link className="action-button variant-secondary" href={`/workbench/${row.id}`}>Approve safe fields</Link>
                        <Link className="action-button variant-secondary" href="/duplicates">Send to duplicates</Link>
                        <Link className="action-button variant-secondary" href={`/workbench/${row.id}`}>Request reparse</Link>
                        <Link className="action-button variant-primary" href={`/workbench/${row.id}`}>Mark escalate</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
        ))
      )}
    </div>
  );
}

function asString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
