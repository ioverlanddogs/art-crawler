import { DataTable, EmptyState, PageHeader, SectionCard, StatCard } from '@/components/admin';
import { prisma } from '@/lib/db';

type PlatformCountRow = {
  source: string;
  _count: { source: number };
};

export default async function DataPage() {
  const [platformCounts, duplicateClusters, lowConfidence] = await Promise.all([
    prisma.ingestExtractedEvent.groupBy({ by: ['source'], _count: { source: true } }),
    prisma.ingestExtractedEvent.groupBy({ by: ['clusterKey'], _count: { clusterKey: true }, where: { clusterKey: { not: null } } }),
    prisma.ingestExtractedEvent.count({ where: { confidenceScore: { lt: 40 } } })
  ]);

  const clusterCount = duplicateClusters.length;

  return (
    <div className="stack">
      <PageHeader title="Data Quality" description="Inspect source composition and deduplication indicators." />
      <div className="stats-grid">
        <StatCard label="Source Platforms" value={platformCounts.length} />
        <StatCard label="Dedup Clusters" value={clusterCount} />
        <StatCard label="Low Confidence Items" value={lowConfidence} detail="Score below 40%" />
        <StatCard label="Tracked Candidates" value={platformCounts.reduce((acc: number, row: PlatformCountRow) => acc + row._count.source, 0)} />
      </div>

      <SectionCard title="Candidates by Platform" subtitle="Current distribution of candidates by ingest source.">
        <DataTable<PlatformCountRow>
          rows={platformCounts}
          rowKey={(row: PlatformCountRow) => row.source}
          emptyState={<EmptyState title="No candidate data" description="No platform records are available." />}
          columns={[
            { key: 'platform', header: 'Platform', render: (row: PlatformCountRow) => row.source },
            { key: 'count', header: 'Candidates', render: (row: PlatformCountRow) => row._count.source }
          ]}
        />
      </SectionCard>
    </div>
  );
}
