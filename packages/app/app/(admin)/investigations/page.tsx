import { AlertBanner, DataTable, EmptyState, PageHeader, SectionCard, StatCard, StatusBadge } from '@/components/admin';
import { prisma } from '@/lib/db';

export default async function InvestigationsPage() {
  const [failureTelemetry, lowConfidence, rejectedToday] = await Promise.all([
    prisma.pipelineTelemetry.findMany({ where: { status: 'failure' }, orderBy: { createdAt: 'desc' }, take: 12 }),
    prisma.candidate.findMany({ where: { confidenceScore: { lt: 0.35 } }, orderBy: { createdAt: 'desc' }, take: 8 }),
    prisma.candidate.findMany({
      where: { status: 'REJECTED', updatedAt: { gte: inLast24Hours() } },
      orderBy: { updatedAt: 'desc' },
      take: 8
    })
  ]);

  return (
    <div className="stack">
      <PageHeader
        title="Investigation Workspace"
        description="Deep-dive on failure signals, repeated rejects, and low-confidence candidates before moderation decisions."
      />

      <div className="stats-grid">
        <StatCard label="Open Failure Signals" value={failureTelemetry.length} detail="Latest 12 events sampled" />
        <StatCard label="Low Confidence Cases" value={lowConfidence.length} detail="Score below 35%" />
        <StatCard label="Recent Rejections" value={rejectedToday.length} detail="Rejected in last 24h" />
        <StatCard label="Escalation Readiness" value={failureTelemetry.length > 0 ? 'Required' : 'Healthy'} />
      </div>

      {failureTelemetry.length > 0 ? (
        <AlertBanner tone="warning" title="Degraded pipeline behavior detected">
          Investigate failing stages first, then review related candidate records before approving further imports.
        </AlertBanner>
      ) : (
        <AlertBanner tone="success" title="No active degradation">
          Current telemetry sample shows no failures. Continue with standard moderation workflows.
        </AlertBanner>
      )}

      <div className="two-col">
        <SectionCard title="Failure Timeline" subtitle="Recent pipeline failures for fast triage and root-cause tracing.">
          <DataTable
            rows={failureTelemetry}
            rowKey={(row) => row.id}
            emptyState={<EmptyState title="No failures" description="No failed stage executions were found." />}
            columns={[
              { key: 'stage', header: 'Stage', render: (row) => row.stage },
              { key: 'detail', header: 'Error', render: (row) => row.detail || 'No detail' },
              { key: 'config', header: 'Config', render: (row) => `v${row.configVersion}` },
              { key: 'time', header: 'Time', render: (row) => new Date(row.createdAt).toLocaleString() }
            ]}
          />
        </SectionCard>

        <SectionCard title="Hypothesis Queue" subtitle="Candidates that likely need manual investigation before decisioning.">
          <ul className="timeline">
            {lowConfidence.map((item) => (
              <li key={item.id}>
                <p>
                  <strong>{item.title}</strong>
                </p>
                <p className="muted">{item.sourcePlatform}</p>
                <p className="kpi-note">Confidence: {Math.round(item.confidenceScore * 100)}%</p>
              </li>
            ))}
            {lowConfidence.length === 0 ? (
              <li>
                <p className="muted">No low-confidence candidates in the current sample.</p>
              </li>
            ) : null}
          </ul>
        </SectionCard>
      </div>

      <SectionCard title="Recent Rejection Decisions" subtitle="Audit recent rejected records to identify repeat patterns.">
        <DataTable
          rows={rejectedToday}
          rowKey={(row) => row.id}
          emptyState={<EmptyState title="No recent rejections" description="No candidates were rejected in the last day." />}
          columns={[
            { key: 'title', header: 'Candidate', render: (row) => row.title },
            { key: 'platform', header: 'Platform', render: (row) => row.sourcePlatform },
            {
              key: 'status',
              header: 'Status',
              render: () => <StatusBadge tone="danger">REJECTED</StatusBadge>
            },
            { key: 'updated', header: 'Updated', render: (row) => new Date(row.updatedAt).toLocaleString() }
          ]}
        />
      </SectionCard>
    </div>
  );
}

function inLast24Hours() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}
