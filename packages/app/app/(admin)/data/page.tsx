import { DataTable, EmptyState, PageHeader, SectionCard, StatCard } from '@/components/admin';
import { prisma } from '@/lib/db';

export default async function DataPage() {
  const [platformCounts, duplicateClusters, lowConfidence] = await Promise.all([
    prisma.candidate.groupBy({ by: ['sourcePlatform'], _count: { sourcePlatform: true } }),
    prisma.candidate.groupBy({ by: ['dedupClusterId'], _count: { dedupClusterId: true }, where: { dedupClusterId: { not: null } } }),
    prisma.candidate.count({ where: { confidenceScore: { lt: 0.4 } } })
  ]);

  const clusterCount = duplicateClusters.length;

  return (
    <div className="stack">
      <PageHeader title="Data Quality" description="Inspect source composition and deduplication indicators." />
      <div className="stats-grid">
        <StatCard label="Source Platforms" value={platformCounts.length} />
        <StatCard label="Dedup Clusters" value={clusterCount} />
        <StatCard label="Low Confidence Items" value={lowConfidence} detail="Score below 40%" />
        <StatCard label="Tracked Candidates" value={platformCounts.reduce((acc, row) => acc + row._count.sourcePlatform, 0)} />
      </div>

      <SectionCard title="Candidates by Platform" subtitle="Current distribution of candidates by ingest source.">
        <DataTable
          rows={platformCounts}
          rowKey={(row) => row.sourcePlatform}
          emptyState={<EmptyState title="No candidate data" description="No platform records are available." />}
          columns={[
            { key: 'platform', header: 'Platform', render: (row) => row.sourcePlatform },
            { key: 'count', header: 'Candidates', render: (row) => row._count.sourcePlatform }
          ]}
        />
      </SectionCard>
    </div>
  );
}
