import { AlertBanner, FailureHotspotList, MetricCard, PageHeader, SectionCard, SeverityBadge, StatusBadge } from '@/components/admin';
import { prisma } from '@/lib/db';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

type AlertItem = {
  id: string;
  title: string;
  detail: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  href: string;
};

const SEVERITY_ORDER: Record<AlertItem['severity'], number> = { critical: 0, high: 1, medium: 2, low: 3 };

export default async function DashboardPage() {
  const since24h = inLast24Hours();

  const [activeConfig, activeModel, pendingModeration, failure24h, failureByStage, latestImportSuccess, backlogStats, recentBatches, importExportTelemetry] =
    await Promise.all([
      safeQuery(() => prisma.pipelineConfigVersion.findFirst({ where: { status: 'ACTIVE' }, orderBy: { activatedAt: 'desc' } }), null),
      safeQuery(() => prisma.modelVersion.findFirst({ where: { status: 'ACTIVE' }, orderBy: { promotedAt: 'desc' } }), null),
      safeQuery(() => prisma.ingestExtractedEvent.count({ where: { status: 'PENDING' } }), 0),
      safeQuery(() => prisma.pipelineTelemetry.count({ where: { status: 'failure', createdAt: { gte: since24h } } }), 0),
      safeQuery(
        () =>
          prisma.pipelineTelemetry.groupBy({
            by: ['stage'],
            _count: { stage: true },
            where: { status: 'failure', createdAt: { gte: since24h } },
            orderBy: { _count: { stage: 'desc' } },
            take: 5
          }),
        []
      ),
      safeQuery(
        () => prisma.pipelineTelemetry.findFirst({ where: { stage: 'import', status: 'success' }, orderBy: { createdAt: 'desc' } }),
        null
      ),
      safeQuery(
        async () => {
          const [oldestPending, pendingTotal] = await Promise.all([
            prisma.ingestExtractedEvent.findFirst({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true, id: true } }),
            prisma.ingestExtractedEvent.count({ where: { status: 'PENDING' } })
          ]);
          return { oldestPending, pendingTotal };
        },
        { oldestPending: null, pendingTotal: 0 as number }
      ),
      safeQuery(
        () =>
          prisma.importBatch.findMany({
            orderBy: { createdAt: 'desc' },
            take: 6,
            select: { id: true, externalBatchId: true, status: true, importedCount: true, errorCount: true, createdAt: true }
          }),
        []
      ),
      safeQuery(
        () =>
          prisma.pipelineTelemetry.groupBy({
            by: ['stage', 'status'],
            _count: { status: true },
            where: { stage: { in: ['import', 'export'] }, createdAt: { gte: since24h } }
          }),
        []
      )
    ]);

  const topFailingStage = failureByStage[0]?.stage ?? null;
  const oldestPendingMinutes = backlogStats.oldestPending ? Math.floor((Date.now() - backlogStats.oldestPending.createdAt.getTime()) / 60000) : null;

  const alerts: AlertItem[] = [];
  if (!activeConfig) alerts.push({ id: 'cfg', severity: 'critical', title: 'No active config version', detail: 'Activate a config to avoid inconsistent stage behavior.', href: '/config' });
  if (!activeModel) alerts.push({ id: 'model', severity: 'high', title: 'No active model version', detail: 'Scoring may be running fallback logic.', href: '/config?tab=model' });
  if (failure24h > 0)
    alerts.push({
      id: 'failure',
      severity: failure24h > 20 ? 'critical' : 'high',
      title: `${failure24h} pipeline failures in last 24h`,
      detail: topFailingStage ? `Top failing stage: ${topFailingStage}.` : 'Failures detected across pipeline stages.',
      href: topFailingStage ? `/investigations?stage=${encodeURIComponent(topFailingStage)}` : '/pipeline'
    });
  if ((oldestPendingMinutes ?? 0) > 120)
    alerts.push({
      id: 'backlog-age',
      severity: 'high',
      title: 'Queue aging above 2h',
      detail: `Oldest pending item has waited ${oldestPendingMinutes} minutes.`,
      href: '/moderation?status=PENDING'
    });
  if (backlogStats.pendingTotal === 0)
    alerts.push({ id: 'empty', severity: 'low', title: 'No pending moderation items', detail: 'Pipeline may be idle or recently drained.', href: '/pipeline' });

  alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const degradedState = alerts.some((alert) => alert.severity === 'critical' || alert.severity === 'high');

  return (
    <div className="stack">
      <PageHeader title="Dashboard" description="Operations overview for pipeline health, moderation pressure, and batch activity." />

      {degradedState ? (
        <AlertBanner tone="danger" title="Degraded system state">
          Critical or high-severity signals are active. Triage failures before increasing moderation throughput.
        </AlertBanner>
      ) : (
        <AlertBanner tone="success" title="Healthy baseline">
          No high-severity alert is active from the current telemetry sample.
        </AlertBanner>
      )}

      <div className="stats-grid">
        <MetricCard
          label="Active config"
          value={activeConfig ? `v${activeConfig.version}` : 'Missing'}
          state={activeConfig ? 'healthy' : 'failing'}
          detail={activeConfig ? `Region: ${activeConfig.region}` : 'No active PipelineConfigVersion'}
          href="/config"
          ctaLabel="Open config versions"
        />
        <MetricCard
          label="Active model"
          value={activeModel ? activeModel.version : 'Missing'}
          state={activeModel ? 'healthy' : 'degraded'}
          detail={activeModel ? `${activeModel.entityType} · ${activeModel.name}` : 'No ACTIVE model version'}
          href="/config?tab=model"
          ctaLabel="Open model versions"
        />
        <MetricCard
          label="Pending moderation"
          value={pendingModeration}
          state={pendingModeration > 50 ? 'failing' : pendingModeration > 10 ? 'degraded' : 'healthy'}
          detail={oldestPendingMinutes ? `Oldest pending: ${oldestPendingMinutes}m` : 'No pending backlog'}
          href="/moderation?status=PENDING"
          ctaLabel="Open pending queue"
        />
        <MetricCard
          label="Failures (24h)"
          value={failure24h}
          state={failure24h > 20 ? 'failing' : failure24h > 0 ? 'degraded' : 'healthy'}
          detail={topFailingStage ? `Top failing stage: ${topFailingStage}` : 'No failed telemetry in 24h'}
          href={topFailingStage ? `/investigations?stage=${encodeURIComponent(topFailingStage)}` : '/pipeline'}
          ctaLabel="Open failure drilldown"
        />
      </div>

      <div className="two-col">
        <SectionCard title="Severity-ranked alerts" subtitle="Prioritized for triage order. Critical items first.">
          {alerts.length === 0 ? (
            <p className="muted">No active alerts. System is in nominal state.</p>
          ) : (
            <ul className="hotspot-list" aria-live="polite">
              {alerts.map((alert) => (
                <li key={alert.id} className="hotspot-item">
                  <div>
                    <p>
                      <strong>{alert.title}</strong>
                    </p>
                    <p className="muted">{alert.detail}</p>
                  </div>
                  <div className="hotspot-actions">
                    <SeverityBadge severity={alert.severity} />
                    <Link href={alert.href} className="inline-link">
                      Open drilldown
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Import/export activity" subtitle="Recent import batches and stage outcomes from the last 24h.">
          <div className="stack">
            <p className="muted">
              Last successful import:{' '}
              {latestImportSuccess ? (
                <>
                  <strong>{latestImportSuccess.createdAt.toLocaleString()}</strong>{' '}
                  <Link href="/pipeline" className="inline-link">
                    Open pipeline
                  </Link>
                </>
              ) : (
                'No successful import telemetry found'
              )}
            </p>
            <ul className="timeline" aria-label="Recent batch summary">
              {recentBatches.map((batch) => (
                <li key={batch.id}>
                  <p>
                    <strong>{batch.externalBatchId}</strong> <StatusBadge tone={batch.errorCount > 0 ? 'danger' : 'info'}>{batch.status}</StatusBadge>
                  </p>
                  <p className="kpi-note">
                    Imported: {batch.importedCount} · Errors: {batch.errorCount} · {batch.createdAt.toLocaleString()}
                  </p>
                  <Link href={`/investigations?importBatchId=${encodeURIComponent(batch.id)}`} className="inline-link">
                    Investigate this batch
                  </Link>
                </li>
              ))}
              {recentBatches.length === 0 ? <li className="muted">No recent batch activity.</li> : null}
            </ul>
            <p className="kpi-note">
              Import/export telemetry (24h):{' '}
              {importExportTelemetry.map((row) => `${row.stage}:${row.status}=${row._count.status}`).join(' · ') || 'No telemetry rows'}
            </p>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Failure hotspots" subtitle="Fast path to localize where failures are concentrated.">
        <FailureHotspotList
          hotspots={failureByStage.map((row) => ({
            key: row.stage,
            label: row.stage,
            failures: row._count.stage,
            severity: row._count.stage > 15 ? 'critical' : row._count.stage > 8 ? 'high' : row._count.stage > 3 ? 'medium' : 'low',
            link: `/investigations?stage=${encodeURIComponent(row.stage)}`
          }))}
        />
      </SectionCard>
    </div>
  );
}

async function safeQuery<T>(query: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await query();
  } catch {
    return fallback;
  }
}

function inLast24Hours() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}
