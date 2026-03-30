import { AlertBanner, DataTable, EmptyState, PageHeader, SectionCard, StatCard, StatusBadge } from '@/components/admin';
import { prisma } from '@/lib/db';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function PipelinePage() {
  const [batches, failures, telemetry, failureByStage] = await Promise.all([
    prisma.importBatch.findMany({ orderBy: { createdAt: 'desc' }, take: 10 }),
    prisma.pipelineTelemetry.findMany({ where: { status: 'failure' }, orderBy: { createdAt: 'desc' }, take: 8 }),
    prisma.pipelineTelemetry.groupBy({ by: ['status'], _count: { status: true }, where: { createdAt: { gte: inLast24Hours() } } }),
    prisma.pipelineTelemetry.groupBy({
      by: ['stage'],
      _count: { stage: true },
      where: { status: 'failure', createdAt: { gte: inLast24Hours() } },
      orderBy: { _count: { stage: 'desc' } }
    })
  ]);

  const success = telemetry.find((x) => x.status === 'success')?._count.status ?? 0;
  const skipped = telemetry.find((x) => x.status === 'skip')?._count.status ?? 0;
  const failed = telemetry.find((x) => x.status === 'failure')?._count.status ?? 0;

  return (
    <div className="stack">
      <PageHeader title="Pipeline" description="Monitor import batches, stage health, and recent failure events." />
      {failed > 0 ? (
        <AlertBanner tone="danger" title="Pipeline failure state active">
          {failed} stage failures were recorded in the past 24 hours. Pause risky config/model changes until investigation is complete.
        </AlertBanner>
      ) : null}

      <div className="stats-grid">
        <StatCard label="Successful Stages (24h)" value={success} />
        <StatCard label="Skipped Stages (24h)" value={skipped} />
        <StatCard label="Failed Stages (24h)" value={failed} />
        <StatCard label="Recent Batches" value={batches.length} detail="Most recent 10 batches" />
      </div>

      <SectionCard title="Import Batches" subtitle="Recent batches received by the import endpoint.">
        <DataTable
          rows={batches}
          rowKey={(row) => row.id}
          emptyState={<EmptyState title="No batches" description="No import batches were found." />}
          columns={[
            { key: 'externalBatchId', header: 'External Batch', render: (row) => row.externalBatchId },
            {
              key: 'status',
              header: 'Status',
              render: (row) => <StatusBadge tone={row.status === 'RECEIVED' ? 'info' : 'neutral'}>{row.status}</StatusBadge>
            },
            { key: 'created', header: 'Created', render: (row) => new Date(row.createdAt).toLocaleString() }
          ]}
        />
      </SectionCard>

      <SectionCard title="Latest Failures" subtitle="Pipeline telemetry rows with failure status.">
        <DataTable
          rows={failures}
          rowKey={(row) => row.id}
          emptyState={<EmptyState title="No failures" description="No failure rows detected. Pipeline health looks good." />}
          columns={[
            { key: 'stage', header: 'Stage', render: (row) => row.stage },
            { key: 'detail', header: 'Detail', render: (row) => row.detail || '—' },
            { key: 'configVersion', header: 'Config', render: (row) => row.configVersion },
            { key: 'createdAt', header: 'When', render: (row) => new Date(row.createdAt).toLocaleString() },
            {
              key: 'investigate',
              header: 'Investigate',
              render: (row) => (
                <Link className="inline-link" href={`/investigations?stage=${encodeURIComponent(row.stage)}`}>
                  Drill down
                </Link>
              )
            }
          ]}
        />
      </SectionCard>

      <SectionCard title="Failure Hotspots" subtitle="Ranked stages by failure count in the last 24 hours.">
        <DataTable
          rows={failureByStage}
          rowKey={(row) => row.stage}
          emptyState={<EmptyState title="No hotspots" description="No stage failures in the selected time window." />}
          columns={[
            { key: 'stage', header: 'Stage', render: (row) => row.stage },
            { key: 'count', header: 'Failures', render: (row) => row._count.stage }
          ]}
        />
      </SectionCard>
    </div>
  );
}

function inLast24Hours() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}
