import { DataTable, EmptyState, PageHeader, SectionCard, StatCard, StatusBadge } from '@/components/admin';
import { prisma } from '@/lib/db';

export default async function SystemPage() {
  const [importFlag, activeConfig, activeModel, recentTelemetry] = await Promise.all([
    prisma.siteSetting.findUnique({ where: { key: 'mining_import_enabled' } }),
    prisma.pipelineConfigVersion.findFirst({ where: { isActive: true }, orderBy: { version: 'desc' } }),
    prisma.modelVersion.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'desc' } }),
    prisma.pipelineTelemetry.findMany({ orderBy: { createdAt: 'desc' }, take: 8 })
  ]);

  return (
    <div className="stack">
      <PageHeader title="System Health" description="Core system toggles, active versions, and recent telemetry events." />

      <div className="stats-grid">
        <StatCard
          label="Mining Import"
          value={importFlag?.value === 'true' ? <StatusBadge tone="success">Enabled</StatusBadge> : <StatusBadge tone="warning">Disabled</StatusBadge>}
        />
        <StatCard label="Active Config" value={activeConfig ? `v${activeConfig.version}` : 'None'} />
        <StatCard label="Active Model" value={activeModel ? `${activeModel.name} (${activeModel.version})` : 'None'} />
        <StatCard label="Recent Telemetry" value={recentTelemetry.length} detail="Most recent 8 events" />
      </div>

      <SectionCard title="Telemetry Stream" subtitle="Latest pipeline telemetry events across all stages.">
        <DataTable
          rows={recentTelemetry}
          rowKey={(row) => row.id}
          emptyState={<EmptyState title="No telemetry" description="No telemetry rows are currently available." />}
          columns={[
            { key: 'stage', header: 'Stage', render: (row) => row.stage },
            {
              key: 'status',
              header: 'Status',
              render: (row) => (
                <StatusBadge tone={row.status === 'success' ? 'success' : row.status === 'failure' ? 'danger' : 'warning'}>
                  {row.status}
                </StatusBadge>
              )
            },
            { key: 'detail', header: 'Detail', render: (row) => row.detail || '—' },
            { key: 'createdAt', header: 'Time', render: (row) => new Date(row.createdAt).toLocaleString() }
          ]}
        />
      </SectionCard>
    </div>
  );
}
