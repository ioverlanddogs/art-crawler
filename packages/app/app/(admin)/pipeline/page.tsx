import {
  FailureHotspotList,
  MetricCard,
  PageHeader,
  RecoveryActionPanel,
  RecoveryAuditFeed,
  RecoveryStateBanner,
  ReplayEligibilityList,
  SectionCard,
  StatusBadge,
  ScopeBadge,
  SlaBadge,
  SlaTimerCard,
  StatCard,
  TrendSummaryCard
} from '@/components/admin';
import { aggregatePipelineFailures } from '@/lib/admin/data-health';
import { prisma } from '@/lib/db';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const PIPELINE_STAGES = ['discovery', 'fetch', 'extract', 'normalise', 'score', 'deduplicate', 'enrich', 'mature', 'export', 'import'] as const;
const RECOVERY_AUDIT_STAGES = [
  'recovery_pause',
  'recovery_resume',
  'recovery_drain_start',
  'recovery_drain_stop',
  'recovery_replay_request',
  'recovery_retry_request',
  'maintenance_flag_change'
] as const;

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

type TelemetryRow = Awaited<ReturnType<typeof prisma.pipelineTelemetry.findMany>>[number];
type ImportBatchRow = Awaited<ReturnType<typeof prisma.importBatch.findMany>>[number];
type RecoveryAuditEvent = {
  id: string;
  stage: string;
  status: string;
  detail: string | null;
  createdAt: string;
};

export default async function PipelinePage() {
  const since24h = inLast24Hours();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    recentTelemetryResult,
    recentFailuresResult,
    recentImportExportFailuresResult,
    importFlagResult,
    drainFlagResult,
    failedBatchesResult,
    recoveryAuditResult
  ] = await Promise.allSettled([
    prisma.pipelineTelemetry.findMany({
      where: { createdAt: { gte: since24h }, stage: { in: [...PIPELINE_STAGES] } },
      orderBy: { createdAt: 'desc' },
      take: 1200
    }),
    prisma.pipelineTelemetry.findMany({ where: { status: 'failure', createdAt: { gte: since24h } }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.pipelineTelemetry.findMany({
      where: { status: 'failure', createdAt: { gte: since24h }, stage: { in: ['import', 'export'] } },
      orderBy: { createdAt: 'desc' },
      take: 10
    }),
    prisma.siteSetting.findUnique({ where: { key: 'mining_import_enabled' } }),
    prisma.siteSetting.findUnique({ where: { key: 'pipeline_drain_mode' } }),
    prisma.importBatch.findMany({
      where: { createdAt: { gte: since7d }, OR: [{ errorCount: { gt: 0 } }, { status: { contains: 'FAIL', mode: 'insensitive' } }] },
      orderBy: { createdAt: 'desc' },
      take: 16
    }),
    prisma.pipelineTelemetry.findMany({ where: { stage: { in: [...RECOVERY_AUDIT_STAGES] } }, orderBy: { createdAt: 'desc' }, take: 120 })
  ]);

  const recentTelemetry = settledValue<TelemetryRow[]>(recentTelemetryResult, []);
  const recentFailures = settledValue<TelemetryRow[]>(recentFailuresResult, []);
  const recentImportExportFailures = settledValue<TelemetryRow[]>(recentImportExportFailuresResult, []);
  const failedBatches = settledValue<ImportBatchRow[]>(failedBatchesResult, []);
  const recoveryAuditEvents = settledValue<TelemetryRow[]>(recoveryAuditResult, []).map((row): RecoveryAuditEvent => ({
    id: row.id,
    stage: row.stage,
    status: row.status,
    detail: row.detail,
    createdAt: row.createdAt.toISOString()
  }));

  const telemetryLimited = [recentTelemetryResult, recentFailuresResult, recentImportExportFailuresResult, failedBatchesResult].some(
    (result) => result.status === 'rejected'
  );

  const importEnabled = importFlagResult.status === 'fulfilled' ? importFlagResult.value?.value === 'true' : null;
  const drainMode = drainFlagResult.status === 'fulfilled' ? drainFlagResult.value?.value === 'true' : null;

  const stageMetrics = PIPELINE_STAGES.map((stage): StageMetric => {
    const rows = recentTelemetry.filter((row: TelemetryRow) => row.stage === stage);
    const successCount = rows.filter((row: TelemetryRow) => row.status === 'success').length;
    const failureCount = rows.filter((row: TelemetryRow) => row.status === 'failure').length;
    const throughput = successCount + failureCount;
    const failureRate = throughput ? failureCount / throughput : 0;
    const avgLatencyMs = rows.filter((row: TelemetryRow) => typeof row.durationMs === 'number').length
      ? Math.round(
          rows
            .filter((row): row is TelemetryRow & { durationMs: number } => typeof row.durationMs === 'number')
            .reduce((acc: number, row) => acc + row.durationMs, 0) / rows.filter((row: TelemetryRow) => typeof row.durationMs === 'number').length
        )
      : null;
    const queueDepth = findLatestNumber(rows, 'queueDepth');
    const retries = rows.reduce((acc: number, row: TelemetryRow) => acc + (findNumberValue(row.metadata, 'retryCount') ?? 0), 0);
    const lastSuccessAt = rows.find((row: TelemetryRow) => row.status === 'success')?.createdAt ?? null;

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
  const healthRollup = aggregatePipelineFailures(recentTelemetry);

  const failingCount = stageMetrics.filter((metric) => metric.health === 'failing').length;
  const degradedCount = stageMetrics.filter((metric) => metric.health === 'degraded').length;


  const oldestFailureMinutes = recentFailures[0] ? Math.floor((Date.now() - recentFailures[0].createdAt.getTime()) / 60000) : null;
  const overdueQueueCount = stageMetrics.filter((metric) => (metric.queueDepth ?? 0) > 40).length;

  const replayingSignal = recoveryAuditEvents.find((event) => event.stage === 'recovery_replay_request');
  const blockedReplayReason = importEnabled === false ? 'Replay is blocked while imports are paused.' : drainMode ? 'Replay is blocked while drain mode is active.' : null;

  const recoveryState = deriveRecoveryState({
    importEnabled,
    drainMode,
    failingCount,
    degradedCount,
    replayingSignal,
    telemetryLimited,
    recentFailures: recentImportExportFailures.length
  });

  const replayEligibleRows = failedBatches.map((batch: ImportBatchRow) => ({
    id: batch.id,
    label: `Batch ${batch.externalBatchId}`,
    failureReason: batch.errorCount > 0 ? `${batch.errorCount} errors captured` : `Status: ${batch.status}`,
    stage: 'import/export',
    createdAt: batch.createdAt.toISOString(),
    scope: 'batch' as const,
    blockedReason: blockedReplayReason
  }));

  return (
    <div className="stack">
      <PageHeader title="Pipeline" description="Incident-response view for recovery state, failed work, replay eligibility, and scoped controls." />

      <div className="filters-row"><ScopeBadge scope="team" /><SlaBadge state={oldestFailureMinutes === null ? 'unknown' : oldestFailureMinutes > 180 ? 'breached' : oldestFailureMinutes > 120 ? 'at_risk' : 'healthy'} inferred /></div>

      <RecoveryStateBanner
        state={recoveryState}
        inferred={telemetryLimited || drainMode === null}
        context={`Imports: ${importEnabled === null ? 'unknown' : importEnabled ? 'enabled' : 'paused'} · Drain mode: ${drainMode === null ? 'unknown' : drainMode ? 'on' : 'off'} · Failing stages: ${failingCount} · Degraded stages: ${degradedCount}`}
        telemetryGap={telemetryLimited ? 'One or more telemetry datasets could not be loaded. Use caution before replay.' : undefined}
      />

      <div className="three-col">
        <SlaTimerCard label="Oldest unresolved incident" ageMinutes={oldestFailureMinutes} targetMinutes={120} inferred />
        <TrendSummaryCard
          title="Overdue queue trend"
          trendLabel={`${overdueQueueCount} stages overdue`}
          trendDirection={overdueQueueCount > 2 ? 'up' : overdueQueueCount > 0 ? 'flat' : 'down'}
          detail="Overdue inferred when queue depth is above 40 in current sample."
        />
        <TrendSummaryCard
          title="Throughput snapshot"
          trendLabel={`${stageMetrics.reduce((acc, item) => acc + item.successCount, 0)} successes / 24h`}
          trendDirection={failingCount > 0 ? 'flat' : 'down'}
          detail="Leadership throughput summary in current scope."
        />
      </div>
      <SectionCard title="Pipeline + source health intelligence" subtitle="Failure-rate and retry risk signals for proactive triage.">
        <div className="stats-grid">
          <StatCard label="Failed extraction jobs" value={healthRollup.failedExtractionJobs} />
          <StatCard label="Parser mismatch spike" value={healthRollup.parserFailureSpike} />
          <StatCard label="response_too_large trend" value={healthRollup.oversizedPayloadFailures} />
          <StatCard label="Unhealthy source skips" value={healthRollup.unhealthySourceSkips} />
          <StatCard label="Queue congestion (stages > 40)" value={overdueQueueCount} />
          <StatCard label="Retry hotspots" value={stageMetrics.filter((stage) => stage.retries > 5).length} />
        </div>
      </SectionCard>

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
        <SectionCard title="Recent failed work" subtitle="Most recent failures with links for root-cause analysis.">
          <ul className="timeline" aria-label="Recent failed work list">
            {recentImportExportFailures.map((row: TelemetryRow) => (
              <li key={row.id}>
                <p>
                  <strong>{row.stage}</strong> <StatusBadge tone="danger">Failure</StatusBadge>
                </p>
                <p className="muted">{row.detail ?? 'No detail captured.'}</p>
                <p className="kpi-note">{row.createdAt.toLocaleString()} · Config v{row.configVersion ?? '—'}</p>
                <Link className="inline-link" href={`/investigations?stage=${encodeURIComponent(row.stage)}&error=${encodeURIComponent(row.detail ?? '')}`}>
                  Open investigation context
                </Link>
              </li>
            ))}
            {recentImportExportFailures.length === 0 ? <li className="muted">No import/export failures in the last 24 hours.</li> : null}
          </ul>
        </SectionCard>

        <ReplayEligibilityList rows={replayEligibleRows} />
      </div>

      <RecoveryActionPanel
        importEnabled={importEnabled}
        drainMode={drainMode}
        blockedReplay={blockedReplayReason}
        telemetryLimited={telemetryLimited}
      />

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

        <SectionCard title="Recovery audit feed" subtitle="Who triggered recovery actions, why, and with what scope/outcome.">
          <p className="kpi-note"><a href="#audit-log" className="inline-link">Jump to filtered recovery audit log</a></p>
          <RecoveryAuditFeed events={recoveryAuditEvents} hasGaps={telemetryLimited || recoveryAuditEvents.some((event) => !event.detail)} />
        </SectionCard>
      </div>
    </div>
  );
}

function deriveRecoveryState({
  importEnabled,
  drainMode,
  failingCount,
  degradedCount,
  replayingSignal,
  telemetryLimited,
  recentFailures
}: {
  importEnabled: boolean | null;
  drainMode: boolean | null;
  failingCount: number;
  degradedCount: number;
  replayingSignal: RecoveryAuditEvent | undefined;
  telemetryLimited: boolean;
  recentFailures: number;
}) {
  if (telemetryLimited && importEnabled === null && drainMode === null) return 'unknown' as const;
  if (importEnabled === false) return 'paused' as const;
  if (drainMode) return 'draining' as const;
  if (replayingSignal && Date.now() - new Date(replayingSignal.createdAt).getTime() < 60 * 60 * 1000) return 'replaying' as const;
  if (failingCount > 0) return 'degraded' as const;
  if (degradedCount > 0 || recentFailures > 0) return 'partially_recovered' as const;
  return 'recovered' as const;
}

function inferErrorCategory(detail?: string | null) {
  const text = detail?.toLowerCase() ?? '';
  if (text.includes('timeout')) return 'timeout';
  if (text.includes('auth')) return 'auth';
  if (text.includes('schema') || text.includes('valid')) return 'validation';
  if (text.includes('network') || text.includes('dns')) return 'network';
  return 'other';
}

function findLatestNumber(rows: TelemetryRow[], key: string): number | null {
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

function settledValue<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === 'fulfilled' ? result.value : fallback;
}

function inLast24Hours() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}
