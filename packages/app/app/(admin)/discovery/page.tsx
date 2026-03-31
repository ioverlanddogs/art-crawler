import { DataTable, EmptyState, PageHeader, SectionCard, StatCard, StatusBadge } from '@/components/admin';
import { aggregatePipelineFailures } from '@/lib/admin/data-health';
import { prisma } from '@/lib/db';

type DiscoveryRow = {
  id: string;
  title: string;
  source: string;
  createdAt: Date;
  confidenceScore: number;
};

export default async function DiscoveryPage() {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [recentCandidates, todaysCandidates, duplicateYieldBySource, pipelineRows] = await Promise.all([
    prisma.ingestExtractedEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: { id: true, title: true, source: true, createdAt: true, confidenceScore: true }
    }),
    prisma.ingestExtractedEvent.count({ where: { createdAt: { gte: startOfDayUtc() } } }),
    prisma.duplicateCandidate.groupBy({ by: ['source'], _count: { _all: true }, where: { createdAt: { gte: since24h } }, orderBy: { _count: { _all: 'desc' } }, take: 10 }),
    prisma.pipelineTelemetry.findMany({ where: { createdAt: { gte: since24h } }, select: { stage: true, status: true, detail: true, metadata: true, createdAt: true } })
  ]);
  const pipelineHealth = aggregatePipelineFailures(pipelineRows);

  return (
    <div className="stack">
      <PageHeader title="Discovery" description="Track incoming discovery flow, duplicate-heavy sources, and parser reliability." />
      <div className="stats-grid">
        <StatCard label="New Today" value={todaysCandidates} detail="Candidates discovered today" />
        <StatCard label="Recent Window" value={recentCandidates.length} detail="Most recent sampled rows" />
        <StatCard label="High Confidence" value={recentCandidates.filter((c: DiscoveryRow) => c.confidenceScore >= 70).length} />
        <StatCard label="Low Confidence" value={recentCandidates.filter((c: DiscoveryRow) => c.confidenceScore < 40).length} />
        <StatCard label="Duplicate candidate yield /24h" value={duplicateYieldBySource.reduce((acc, row) => acc + row._count._all, 0)} />
        <StatCard label="Parser failure spike /24h" value={pipelineHealth.parserFailureSpike} />
      </div>

      <div className="two-col">
        <SectionCard title="Recent Discoveries" subtitle="Most recent candidate sources and confidence bands.">
          <DataTable<DiscoveryRow>
            rows={recentCandidates}
            rowKey={(row: DiscoveryRow) => row.id}
            emptyState={<EmptyState title="No discoveries yet" description="No candidates are available to evaluate discovery output." />}
            columns={[
              { key: 'title', header: 'Title', render: (row: DiscoveryRow) => row.title },
              { key: 'sourcePlatform', header: 'Source', render: (row: DiscoveryRow) => row.source },
              {
                key: 'band',
                header: 'Confidence Band',
                render: (row: DiscoveryRow) => {
                  if (row.confidenceScore >= 70) return <StatusBadge tone="success">High</StatusBadge>;
                  if (row.confidenceScore >= 40) return <StatusBadge tone="warning">Medium</StatusBadge>;
                  return <StatusBadge tone="danger">Low</StatusBadge>;
                }
              },
              { key: 'createdAt', header: 'Discovered', render: (row: DiscoveryRow) => new Date(row.createdAt).toLocaleString() }
            ]}
          />
        </SectionCard>

        <SectionCard title="Duplicate-heavy sources" subtitle="Discovery source hotspots ranked by duplicate candidate yield in last 24h.">
          <DataTable
            rows={duplicateYieldBySource}
            rowKey={(row: any) => row.source ?? 'unknown'}
            emptyState={<EmptyState title="No duplicate hotspot sources" description="No duplicate candidates were created in the last 24 hours." />}
            columns={[
              { key: 'source', header: 'Source', render: (row: any) => row.source ?? 'unknown' },
              { key: 'count', header: 'Duplicate candidates', render: (row: any) => row._count._all },
              {
                key: 'cta',
                header: 'Action',
                render: (row: any) => (
                  <a className="inline-link" href={`/investigations?source=${encodeURIComponent(row.source ?? 'unknown')}`}>
                    Open hotspot investigation
                  </a>
                )
              }
            ]}
          />
        </SectionCard>
      </div>
    </div>
  );
}

function startOfDayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
