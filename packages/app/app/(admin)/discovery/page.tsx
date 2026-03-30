import { DataTable, EmptyState, PageHeader, SectionCard, StatCard, StatusBadge } from '@/components/admin';
import { prisma } from '@/lib/db';

export default async function DiscoveryPage() {
  const [recentCandidates, todaysCandidates] = await Promise.all([
    prisma.candidate.findMany({ orderBy: { createdAt: 'desc' }, take: 12, select: { id: true, title: true, sourcePlatform: true, createdAt: true, confidenceScore: true } }),
    prisma.candidate.count({ where: { createdAt: { gte: startOfDayUtc() } } })
  ]);

  return (
    <div className="stack">
      <PageHeader title="Discovery" description="Track incoming discovery flow and signal quality by source." />
      <div className="stats-grid">
        <StatCard label="New Today" value={todaysCandidates} detail="Candidates discovered today" />
        <StatCard label="Recent Window" value={recentCandidates.length} detail="Most recent sampled rows" />
        <StatCard label="High Confidence" value={recentCandidates.filter((c) => c.confidenceScore >= 0.7).length} />
        <StatCard label="Low Confidence" value={recentCandidates.filter((c) => c.confidenceScore < 0.4).length} />
      </div>

      <SectionCard title="Recent Discoveries" subtitle="Most recent candidate sources and confidence bands.">
        <DataTable
          rows={recentCandidates}
          rowKey={(row) => row.id}
          emptyState={<EmptyState title="No discoveries yet" description="No candidates are available to evaluate discovery output." />}
          columns={[
            { key: 'title', header: 'Title', render: (row) => row.title },
            { key: 'sourcePlatform', header: 'Source', render: (row) => row.sourcePlatform },
            {
              key: 'band',
              header: 'Confidence Band',
              render: (row) => {
                if (row.confidenceScore >= 0.7) return <StatusBadge tone="success">High</StatusBadge>;
                if (row.confidenceScore >= 0.4) return <StatusBadge tone="warning">Medium</StatusBadge>;
                return <StatusBadge tone="danger">Low</StatusBadge>;
              }
            },
            { key: 'createdAt', header: 'Discovered', render: (row) => new Date(row.createdAt).toLocaleString() }
          ]}
        />
      </SectionCard>
    </div>
  );
}

function startOfDayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
