import { AlertBanner, FailureHotspotList, MetricCard, PageHeader, SectionCard, StatusBadge } from '@/components/admin';
import { prisma } from '@/lib/db';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const PIPELINE_STAGES = ['discovery', 'fetch', 'extract', 'normalise', 'score', 'deduplicate', 'enrich', 'mature', 'export', 'import'] as const;

type StageMetric = {
  stage: string;
  throughput: number;
  successCount: number;
  failureCount: number;
  failureRate: number;
  queueDepth: number | null;
  avgLatencyMs: number | null;
  retries: number;
  lastSuccessAt: Date | null;
  health: 'healthy' | 'degraded' | 'failing' | 'unknown';
};

export default async function PipelinePage() {
  const since24h = inLast24Hours();

  const [recentTelemetry, recentFailures, recentImportExportFailures] = await Promise.all([
    safeQuery(
      () =>
        prisma.pipelineTelemetry.findMany({
          where: { createdAt: { gte: since24h }, stage: { in: [...PIPELINE_STAGES] } },
          orderBy: { createdAt: 'desc' },
          take: 1200
        }),
      []
    ),
    safeQuery(
      () =>
        prisma.pipelineTelemetry.findMany({
          where: { status: 'failure', createdAt: { gte: since24h } },
          orderBy: { createdAt: 'desc' },
          take: 20
        }),
      []
    ),
    safeQuery(
      () =>
        prisma.pipelineTelemetry.findMany({
          where: { status: 'failure', createdAt: { gte: since24h }, stage: { in: ['import', 'export'] } },
          orderBy: { createdAt: 'desc' },
          take: 10
        }),
      []
    )
  ]);

  const stageMetrics = PIPELINE_STAGES.map((stage): StageMetric => {
    const rows = recentTelemetry.filter((row) => row.stage === stage);
    const successCount = rows.filter((row) => row.status === 'success').length;
    const failureCount = rows.filter((row) => row.status === 'failure').length;
    const throughput = successCount + failureCount;
    const failureRate = throughput ? failureCount / throughput : 0;
    const avgLatencyMs = rows.filter((row) => typeof row.durationMs === 'number').length
      ? Math.round(
          rows
            .filter((row): row is typeof row & { durationMs: number } => typeof row.durationMs === 'number')
            .reduce((acc, row) => acc + row.durationMs, 0) / rows.filter((row) => typeof row.durationMs === 'number').length
        )
      : null;
    const queueDepth = findLatestNumber(rows, 'queueDepth');
    const retries = rows.reduce((acc, row) => acc + (findNumberValue(row.metadata, 'retryCount') ?? 0), 0);
    const lastSuccessAt = rows.find((row) => row.status === 'success')?.createdAt ?? null;

    const health: StageMetric['health'] =
      rows.length === 0
        ? 'unknown'
        : failureRate >= 0.3
          ? 'failing'
          : failureRate > 0 || (!lastSuccessAt && rows.length > 4)
            ? 'degraded'
            : 'healthy';

    return { stage, throughput, successCount, failureCount, failureRate, queueDepth, avgLatencyMs, retries, lastSuccessAt, health };
  });

  const topFailingStages = [...stageMetrics]
    .filter((metric) => metric.failureCount > 0)
    .sort((a, b) => b.failureCount - a.failureCount)
    .slice(0, 5);

  const errorCategoryMap = new Map<string, number>();
  for (const failure of recentFailures) {
    const category = (findStringValue(failure.metadata, 'errorCategory') ?? inferErrorCategory(failure.detail)).toLowerCase();
    errorCategoryMap.set(category, (errorCategoryMap.get(category) ?? 0) + 1);
  }
  const topErrorCategories = [...errorCategoryMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const failingCount = stageMetrics.filter((metric) => metric.health === 'failing').length;
  const degradedCount = stageMetrics.filter((metric) => metric.health === 'degraded').length;

  return (
    <div className="stack">
      <PageHeader title="Pipeline" description="Incident localization view for stage health, retries, latency, and failure hotspots." />

      {failingCount > 0 ? (
        <AlertBanner tone="danger" title="Blocking failure state">
          {failingCount} stages are failing. Use the stage cards below to localize the fault path quickly.
        </AlertBanner>
      ) : degradedCount > 0 ? (
        <AlertBanner tone="warning" title="Partial failure / degraded state">
          {degradedCount} stages are degraded. Some telemetry signals are healthy while others need investigation.
        </AlertBanner>
      ) : (
        <AlertBanner tone="success" title="Healthy or idle state">No stage is currently marked failing from the last-24h sample.</AlertBanner>
      )}

      <div className="pipeline-grid" role="region" aria-label="Pipeline stage cards">
        {stageMetrics.map((metric) => (
          <MetricCard
            key={metric.stage}
            label={metric.stage}
            value={`${metric.throughput} runs`}
            state={metric.health}
            detail={`Success ${metric.successCount} · Fail ${metric.failureCount} · Failure rate ${Math.round(metric.failureRate * 100)}% · Queue ${metric.queueDepth ?? '—'} · Latency ${metric.avgLatencyMs ?? '—'}ms · Retries ${metric.retries} · Last success ${metric.lastSuccessAt ? metric.lastSuccessAt.toLocaleString() : '—'}`}
            href={`/investigations?stage=${encodeURIComponent(metric.stage)}`}
            ctaLabel="Investigate stage"
          />
        ))}
      </div>

      <div className="two-col">
        <SectionCard title="Failure hotspots" subtitle="Top failing stages and top error categories.">
          <div className="stack">
            <FailureHotspotList
              hotspots={topFailingStages.map((metric) => ({
                key: metric.stage,
                label: metric.stage,
                failures: metric.failureCount,
                severity: metric.failureCount > 15 ? 'critical' : metric.failureCount > 7 ? 'high' : metric.failureCount > 2 ? 'medium' : 'low',
                link: `/investigations?stage=${encodeURIComponent(metric.stage)}`
              }))}
            />
            <div>
              <h3>Top error categories</h3>
              <ul className="hotspot-list">
                {topErrorCategories.map(([category, count]) => (
                  <li key={category} className="hotspot-item">
                    <span>
                      <strong>{category || 'unknown'}</strong>
                    </span>
                    <Link className="inline-link" href={`/investigations?error=${encodeURIComponent(category)}`}>
                      {count} failures → investigate
                    </Link>
                  </li>
                ))}
                {topErrorCategories.length === 0 ? <li className="muted">No categorized errors in this window.</li> : null}
              </ul>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Recent import/export failures" subtitle="Most recent failures for import and export stages.">
          <ul className="timeline">
            {recentImportExportFailures.map((row) => (
              <li key={row.id}>
                <p>
                  <strong>{row.stage}</strong> <StatusBadge tone="danger">failure</StatusBadge>
                </p>
                <p className="muted">{row.detail ?? 'No detail captured.'}</p>
                <p className="kpi-note">{row.createdAt.toLocaleString()} · Config v{row.configVersion ?? '—'}</p>
                <Link className="inline-link" href={`/investigations?stage=${encodeURIComponent(row.stage)}&error=${encodeURIComponent(row.detail ?? '')}`}>
                  Open in investigations
                </Link>
              </li>
            ))}
            {recentImportExportFailures.length === 0 ? <li className="muted">No import/export failures in the last 24 hours.</li> : null}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}

function inferErrorCategory(detail?: string | null) {
  const text = detail?.toLowerCase() ?? '';
  if (text.includes('timeout')) return 'timeout';
  if (text.includes('auth')) return 'auth';
  if (text.includes('schema') || text.includes('valid')) return 'validation';
  if (text.includes('network') || text.includes('dns')) return 'network';
  return 'other';
}

function findLatestNumber(rows: Array<{ metadata: unknown }>, key: string): number | null {
  for (const row of rows) {
    const value = findNumberValue(row.metadata, key);
    if (typeof value === 'number') return value;
  }
  return null;
}

function findNumberValue(metadata: unknown, key: string): number | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'number' ? value : null;
}

function findStringValue(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
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
