import { DataTable, EmptyState, PageHeader, SectionCard, StatCard, StatusBadge } from '@/components/admin';
import { aggregateConfidenceDrift, aggregatePipelineFailures } from '@/lib/admin/data-health';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function DataPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const days = Number(Array.isArray(searchParams?.window) ? searchParams?.window[0] : searchParams?.window ?? '7');
  const since = new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000);

  const [platformCounts, lowConfidence, staleRecords, confidenceBands, telemetryRows, duplicateBySource, rollbackBySource] = await Promise.all([
    prisma.ingestExtractedEvent.groupBy({ by: ['source'], _count: { source: true } }),
    prisma.ingestExtractedEvent.count({ where: { confidenceScore: { lt: 40 }, createdAt: { gte: since } } }),
    prisma.ingestExtractedEvent.count({ where: { createdAt: { lt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) }, status: 'PENDING' } }),
    prisma.ingestExtractedEvent.groupBy({ by: ['confidenceBand'], _count: { confidenceBand: true }, where: { createdAt: { gte: since } } }),
    prisma.pipelineTelemetry.findMany({ where: { createdAt: { gte: since } }, select: { stage: true, status: true, detail: true, metadata: true, createdAt: true } }),
    prisma.duplicateCandidate.groupBy({ by: ['source', 'resolutionStatus'], _count: { _all: true }, where: { createdAt: { gte: since } } }),
    prisma.pipelineTelemetry.groupBy({
      by: ['entityId'],
      _count: { entityId: true },
      where: { stage: { contains: 'rollback' }, createdAt: { gte: since }, entityId: { not: null } },
      orderBy: { _count: { entityId: 'desc' } },
      take: 8
    })
  ]);

  const confidenceDrift = aggregateConfidenceDrift(
    telemetryRows.filter((row) => row.stage === 'score').map((row) => ({ createdAt: row.createdAt, confidenceScore: Number((row as any).metadata?.confidenceScore ?? 50) }))
  );
  const pipelineHealth = aggregatePipelineFailures(telemetryRows);

  return (
    <div className="stack">
      <PageHeader title="Data Health Drilldown" description="Detailed quality analytics across completeness, confidence, duplicates, corroboration, and publish blockers." />
      <div className="stats-grid">
        <StatCard label="Sources" value={platformCounts.length} />
        <StatCard label="Low-confidence required fields" value={lowConfidence} detail={`Window: last ${days} day(s)`} />
        <StatCard label="Stale records" value={staleRecords} detail="Pending >14 days" />
        <StatCard label="Failed extraction jobs" value={pipelineHealth.failedExtractionJobs} />
        <StatCard label="Parser failure spike" value={pipelineHealth.parserFailureSpike} />
        <StatCard label="Oversized payload failures" value={pipelineHealth.oversizedPayloadFailures} />
        <StatCard label="Confidence drift" value={`${confidenceDrift.drift}%`} detail={`${confidenceDrift.previousAverage}% → ${confidenceDrift.currentAverage}%`} />
      </div>

      <div className="two-col">
        <SectionCard title="Confidence band distribution" subtitle="Distribution of confidence bands in selected window.">
          <DataTable
            rows={confidenceBands}
            rowKey={(row: any) => row.confidenceBand}
            emptyState={<EmptyState title="No confidence records" description="Adjust time window filters to load confidence bands." />}
            columns={[
              { key: 'band', header: 'Band', render: (row: any) => row.confidenceBand },
              {
                key: 'status',
                header: 'Risk',
                render: (row: any) => (row.confidenceBand === 'LOW' ? <StatusBadge tone="danger">High risk</StatusBadge> : row.confidenceBand === 'MEDIUM' ? <StatusBadge tone="warning">Watch</StatusBadge> : <StatusBadge tone="success">Healthy</StatusBadge>)
              },
              { key: 'count', header: 'Count', render: (row: any) => row._count.confidenceBand }
            ]}
          />
        </SectionCard>

        <SectionCard title="Duplicate generation rate by source" subtitle="Unresolved, false-positive, and separate-record trends by source.">
          <DataTable
            rows={duplicateBySource}
            rowKey={(row: any) => `${row.source ?? 'unknown'}-${row.resolutionStatus}`}
            emptyState={<EmptyState title="No duplicate data" description="No duplicate candidates found in selected window." />}
            columns={[
              { key: 'source', header: 'Source', render: (row: any) => row.source ?? 'unknown' },
              { key: 'status', header: 'Resolution status', render: (row: any) => row.resolutionStatus },
              { key: 'count', header: 'Count', render: (row: any) => row._count._all }
            ]}
          />
        </SectionCard>
      </div>

      <SectionCard title="Rollback instability by source/reviewer" subtitle="Top rollback-heavy entities in selected window.">
        <DataTable
          rows={rollbackBySource}
          rowKey={(row: any) => `${row.entityId ?? 'unknown'}`}
          emptyState={<EmptyState title="No rollback telemetry" description="No rollback events in selected window." />}
          columns={[
            { key: 'entity', header: 'Entity', render: (row: any) => row.entityId ?? 'unknown' },
            { key: 'count', header: 'Rollback events', render: (row: any) => row._count.entityId }
          ]}
        />
      </SectionCard>
    </div>
  );
}
