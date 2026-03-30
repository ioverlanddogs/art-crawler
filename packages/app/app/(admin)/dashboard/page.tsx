import { DataTable, EmptyState, PageHeader, SectionCard, StatCard, StatusBadge } from '@/components/admin';
import { prisma } from '@/lib/db';

export default async function DashboardPage() {
  const [pendingCount, approvedToday, rejectedToday, batchesToday, recentCandidates, queueAttention] = await Promise.all([
    prisma.candidate.count({ where: { status: 'PENDING' } }),
    prisma.candidate.count({ where: { status: 'APPROVED', updatedAt: { gte: startOfDayUtc() } } }),
    prisma.candidate.count({ where: { status: 'REJECTED', updatedAt: { gte: startOfDayUtc() } } }),
    prisma.importBatch.count({ where: { createdAt: { gte: startOfDayUtc() } } }),
    prisma.candidate.findMany({ orderBy: { createdAt: 'desc' }, take: 8 }),
    prisma.pipelineTelemetry.groupBy({ by: ['status'], _count: { status: true }, where: { createdAt: { gte: startOfDayUtc() } } })
  ]);

  const attentionRows = queueAttention.map((row) => ({ id: row.status, status: row.status, count: row._count.status }));

  return (
    <div className="stack">
      <PageHeader title="Dashboard" description="Operational snapshot for imports, moderation, and queue health." />

      <div className="stats-grid">
        <StatCard label="Pending Review" value={pendingCount} detail="Candidates waiting moderation" />
        <StatCard label="Approved Today" value={approvedToday} detail="Moderation approvals in last 24h" />
        <StatCard label="Rejected Today" value={rejectedToday} detail="Moderation rejections in last 24h" />
        <StatCard label="Import Batches Today" value={batchesToday} detail="Batches received today" />
      </div>

      <div className="two-col">
        <SectionCard title="Recent Import Activity" subtitle="Most recently received candidates.">
          <DataTable
            rows={recentCandidates}
            rowKey={(row) => row.id}
            emptyState={<EmptyState title="No imports yet" description="No candidate records are available for display." />}
            columns={[
              { key: 'title', header: 'Title', render: (row) => row.title },
              { key: 'platform', header: 'Platform', render: (row) => row.sourcePlatform },
              {
                key: 'status',
                header: 'Status',
                render: (row) => (
                  <StatusBadge tone={row.status === 'APPROVED' ? 'success' : row.status === 'REJECTED' ? 'danger' : 'warning'}>
                    {row.status}
                  </StatusBadge>
                )
              },
              { key: 'score', header: 'Confidence', render: (row) => `${Math.round(row.confidenceScore * 100)}%` }
            ]}
          />
        </SectionCard>

        <SectionCard title="Queue Attention" subtitle="Telemetry status counts from the last 24 hours.">
          <DataTable
            rows={attentionRows}
            rowKey={(row) => row.id}
            emptyState={<EmptyState title="No telemetry found" description="No pipeline telemetry rows were recorded in the last day." />}
            columns={[
              { key: 'status', header: 'Status', render: (row) => row.status },
              { key: 'count', header: 'Count', render: (row) => row.count }
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
