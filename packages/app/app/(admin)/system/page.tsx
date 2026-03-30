import {
  DataTable,
  EmptyState,
  PageHeader,
  RecoveryAuditFeed,
  RecoveryStateBadge,
  RecoveryStateBanner,
  SectionCard,
  StatCard,
  StatusBadge,
  ScopeBadge,
  SlaBadge,
  TrendSummaryCard
} from '@/components/admin';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const RECOVERY_AUDIT_STAGES = [
  'recovery_pause',
  'recovery_resume',
  'recovery_drain_start',
  'recovery_drain_stop',
  'recovery_replay_request',
  'recovery_retry_request',
  'maintenance_flag_change'
] as const;

export default async function SystemPage() {
  const [importFlagResult, drainFlagResult, activeConfigResult, activeModelResult, recentTelemetryResult, recoveryAuditResult] = await Promise.allSettled([
    prisma.siteSetting.findUnique({ where: { key: 'mining_import_enabled' } }),
    prisma.siteSetting.findUnique({ where: { key: 'pipeline_drain_mode' } }),
    prisma.pipelineConfigVersion.findFirst({ where: { status: 'ACTIVE' }, orderBy: { version: 'desc' } }),
    prisma.modelVersion.findFirst({ where: { status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } }),
    prisma.pipelineTelemetry.findMany({ orderBy: { createdAt: 'desc' }, take: 8 }),
    prisma.pipelineTelemetry.findMany({ where: { stage: { in: [...RECOVERY_AUDIT_STAGES] } }, orderBy: { createdAt: 'desc' }, take: 80 })
  ]);

  const importFlag = importFlagResult.status === 'fulfilled' ? importFlagResult.value : null;
  const drainFlag = drainFlagResult.status === 'fulfilled' ? drainFlagResult.value : null;
  const activeConfig = activeConfigResult.status === 'fulfilled' ? activeConfigResult.value : null;
  const activeModel = activeModelResult.status === 'fulfilled' ? activeModelResult.value : null;
  const recentTelemetry = recentTelemetryResult.status === 'fulfilled' ? recentTelemetryResult.value : [];
  const recoveryAudit =
    recoveryAuditResult.status === 'fulfilled'
      ? recoveryAuditResult.value.map((row) => ({ id: row.id, stage: row.stage, status: row.status, detail: row.detail, createdAt: row.createdAt.toISOString() }))
      : [];

  const hasPartialData = [importFlagResult, drainFlagResult, activeConfigResult, activeModelResult, recentTelemetryResult, recoveryAuditResult].some(
    (result) => result.status === 'rejected'
  );

  const importEnabled = importFlag?.value === 'true';
  const drainMode = drainFlag?.value === 'true';
  const latestReplayRequest = recoveryAudit.find((entry) => entry.stage === 'recovery_replay_request');

  const staleTelemetryMinutes = recentTelemetry[0] ? Math.floor((Date.now() - new Date(recentTelemetry[0].createdAt).getTime()) / 60000) : null;
  const slaState = staleTelemetryMinutes === null ? 'unknown' : staleTelemetryMinutes > 180 ? 'breached' : staleTelemetryMinutes > 120 ? 'at_risk' : 'healthy';

  const state = !importFlag && !drainFlag && hasPartialData
    ? 'unknown'
    : importEnabled
      ? drainMode
        ? 'draining'
        : latestReplayRequest && Date.now() - new Date(latestReplayRequest.createdAt).getTime() < 60 * 60 * 1000
          ? 'replaying'
          : 'recovered'
      : 'paused';

  return (
    <div className="stack">
      <PageHeader title="System Health" description="Operational state visibility for recovery controls, feature toggles, and audit context." />

      <div className="filters-row"><ScopeBadge scope="global" /><SlaBadge state={slaState} inferred /></div>

      <RecoveryStateBanner
        state={state}
        inferred={hasPartialData}
        context={`Import intake: ${importFlag ? (importEnabled ? 'enabled' : 'paused') : 'unknown'} · Drain mode: ${drainFlag ? (drainMode ? 'on' : 'off') : 'unknown'}`}
        telemetryGap={hasPartialData ? 'Some control-plane sources did not load; state may be incomplete.' : undefined}
      />

      <div className="stats-grid">
        <StatCard
          label="Mining Import"
          value={
            importFlag ? (
              importEnabled ? (
                <StatusBadge tone="success">Enabled</StatusBadge>
              ) : (
                <StatusBadge tone="warning">Paused</StatusBadge>
              )
            ) : (
              <StatusBadge tone="neutral">Unknown</StatusBadge>
            )
          }
        />
        <StatCard
          label="Drain Mode"
          value={drainFlag ? (drainMode ? <StatusBadge tone="warning">Draining</StatusBadge> : <StatusBadge tone="success">Off</StatusBadge>) : <StatusBadge tone="neutral">Unknown</StatusBadge>}
        />
        <StatCard label="Active Config" value={activeConfig ? `v${activeConfig.version}` : 'None'} />
        <StatCard label="Active Model" value={activeModel ? `${activeModel.name} (${activeModel.version})` : 'None'} />
      </div>

      <div className="three-col">
        <TrendSummaryCard title="Telemetry freshness" trendLabel={staleTelemetryMinutes === null ? 'Unknown' : `${staleTelemetryMinutes}m old`} trendDirection={staleTelemetryMinutes === null ? 'unknown' : staleTelemetryMinutes > 120 ? 'up' : 'down'} detail="Higher values indicate increasing observability risk." />
        <TrendSummaryCard title="Recovery action activity" trendLabel={`${recoveryAudit.length} audit events`} trendDirection={recoveryAudit.length > 20 ? 'up' : recoveryAudit.length > 0 ? 'flat' : 'down'} detail="Includes pause/resume/replay/retry control-plane actions." />
        <TrendSummaryCard title="Unknown telemetry footprint" trendLabel={hasPartialData ? 'Partial data active' : 'Complete sample'} trendDirection={hasPartialData ? 'up' : 'down'} detail="State labels remain textual even with incomplete telemetry." />
      </div>

      <SectionCard title="Recovery state matrix" subtitle="Textual labels for control-plane states, independent of color cues.">
        <div className="recovery-state-grid" role="region" aria-label="Recovery state matrix">
          {['paused', 'replaying', 'draining', 'partially_recovered', 'recovered', 'blocked', 'unknown'].map((key) => (
            <div key={key} className="recovery-action-item">
              <p>
                <RecoveryStateBadge state={key as 'paused' | 'replaying' | 'draining' | 'partially_recovered' | 'recovered' | 'blocked' | 'unknown'} />
              </p>
              <p className="muted">
                {key === 'paused' && 'New imports are intentionally held.'}
                {key === 'replaying' && 'Recovery replay work has been requested recently.'}
                {key === 'draining' && 'In-flight work is being allowed to complete.'}
                {key === 'partially_recovered' && 'Some symptoms are improving but not fully cleared.'}
                {key === 'recovered' && 'No active degradation signal in available telemetry.'}
                {key === 'blocked' && 'Replay/retry should not proceed under current controls.'}
                {key === 'unknown' && 'Not enough telemetry to determine true state confidently.'}
              </p>
            </div>
          ))}
        </div>
      </SectionCard>

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

      <SectionCard title="Recovery action audit" subtitle="Actor, reason, scope, and outcome for replay/retry/pause/resume controls.">
        <RecoveryAuditFeed events={recoveryAudit} hasGaps={hasPartialData || recoveryAudit.some((event) => !event.detail)} />
      </SectionCard>
    </div>
  );
}
