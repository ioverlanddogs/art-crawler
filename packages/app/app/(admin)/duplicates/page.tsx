import Link from 'next/link';
import { EmptyState, PageHeader, SectionCard } from '@/components/admin';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const FILTERS = ['high-confidence', 'conflicting-values', 'uncorroborated', 'publish-blocked'] as const;

export default async function DuplicateQueuePage({
  searchParams
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const activeFilter = asString(searchParams?.filter);
  const where: Record<string, unknown> = { resolutionStatus: 'unresolved' };
  if (activeFilter === 'high-confidence') where.matchConfidence = { gte: 0.8 };
  if (activeFilter === 'conflicting-values') where.conflictingSourceCount = { gt: 0 };
  if (activeFilter === 'uncorroborated') where.corroborationSourceCount = { lt: 1 };
  if (activeFilter === 'publish-blocked') where.unresolvedBlockerCount = { gt: 0 };

  const candidates = await prisma.duplicateCandidate.findMany({
    where,
    include: {
      proposedChangeSet: { select: { id: true, reviewStatus: true } },
      canonicalEvent: { select: { id: true, title: true } }
    },
    orderBy: [{ unresolvedBlockerCount: 'desc' }, { matchConfidence: 'desc' }, { updatedAt: 'desc' }],
    take: 300
  });

  return (
    <div className="stack">
      <PageHeader title="Duplicate candidate queue" description="Resolve duplicate + corroboration risks before publish." />

      <SectionCard title="Queue filters">
        <div className="filters-row">
          <Link href="/duplicates" className={`action-button ${!activeFilter ? 'variant-primary' : 'variant-secondary'}`}>All unresolved</Link>
          {FILTERS.map((filter) => (
            <Link key={filter} href={`/duplicates?filter=${filter}`} className={`action-button ${activeFilter === filter ? 'variant-primary' : 'variant-secondary'}`}>
              {filter}
            </Link>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Unresolved duplicate candidates" subtitle="Candidates here block publish if unresolved blockers/conflicts remain.">
        {candidates.length === 0 ? (
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
              {candidates.map((row) => (
                <tr key={row.id}>
                  <td><code>{row.id}</code></td>
                  <td>{Math.round(row.matchConfidence * 100)}%</td>
                  <td>{row.recordType} · {row.source ?? 'unknown'}</td>
                  <td>{row.canonicalEvent ? `${row.canonicalEvent.title} (${row.canonicalEvent.id})` : 'No canonical target'}</td>
                  <td>{row.unresolvedBlockerCount}</td>
                  <td>{row.corroborationSourceCount} src · {Math.round(row.corroborationConfidence * 100)}%</td>
                  <td>
                    <div className="filters-row">
                      <Link href={`/duplicates/${row.id}`} className="action-button variant-primary">Open compare</Link>
                      <Link href={`/duplicates/${row.id}`} className="action-button variant-secondary">Merge</Link>
                      <Link href={`/duplicates/${row.id}`} className="action-button variant-secondary">Keep separate</Link>
                      <Link href={`/duplicates/${row.id}`} className="action-button variant-secondary">Mark false positive</Link>
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

function asString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
