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
import { AdminSetupRequired } from '@/components/admin/AdminSetupRequired';
import { requireRole } from '@/lib/auth-guard';
import { getApiKeyStatuses } from '@/lib/api-key-status';
import { prisma } from '@/lib/db';
import { isDatabaseRuntimeReady } from '@/lib/runtime-env';

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

type TelemetryRow = Awaited<ReturnType<typeof prisma.pipelineTelemetry.findMany>>[number];
type RecoveryAuditEvent = {
  id: string;
  stage: string;
  status: string;
  detail: string | null;
  createdAt: string;
};
type RecoveryState = 'paused' | 'replaying' | 'draining' | 'partially_recovered' | 'recovered' | 'blocked' | 'unknown';
const RECOVERY_STATES: RecoveryState[] = ['paused', 'replaying', 'draining', 'partially_recovered', 'recovered', 'blocked', 'unknown'];

export default async function SystemPage() {
  await requireRole(['admin', 'operator']);

  if (!isDatabaseRuntimeReady()) {
    return <AdminSetupRequired />;
  }

  const [importFlagResult, drainFlagResult, activeConfigResult, activeModelResult, recentTelemetryResult, recoveryAuditResult, aiProviderSettingResult] = await Promise.allSettled([
    prisma.siteSetting.findUnique({ where: { key: 'mining_import_enabled' } }),
    prisma.siteSetting.findUnique({ where: { key: 'pipeline_drain_mode' } }),
    prisma.pipelineConfigVersion.findFirst({ where: { status: 'ACTIVE' }, orderBy: { version: 'desc' } }),
    prisma.modelVersion.findFirst({ where: { status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } }),
    prisma.pipelineTelemetry.findMany({ orderBy: { createdAt: 'desc' }, take: 8 }),
    prisma.pipelineTelemetry.findMany({ where: { stage: { in: [...RECOVERY_AUDIT_STAGES] } }, orderBy: { createdAt: 'desc' }, take: 80 }),
    prisma.siteSetting.findUnique({ where: { key: 'ai_extraction_provider' } })
  ]);

  const importFlag = importFlagResult.status === 'fulfilled' ? importFlagResult.value : null;
  const drainFlag = drainFlagResult.status === 'fulfilled' ? drainFlagResult.value : null;
  const activeConfig = activeConfigResult.status === 'fulfilled' ? activeConfigResult.value : null;
  const activeModel = activeModelResult.status === 'fulfilled' ? activeModelResult.value : null;
  const recentTelemetry: TelemetryRow[] = recentTelemetryResult.status === 'fulfilled' ? recentTelemetryResult.value : [];
  const aiProviderSetting = aiProviderSettingResult.status === 'fulfilled' ? aiProviderSettingResult.value : null;
  const activeProvider = (aiProviderSetting?.value ?? 'anthropic') as 'anthropic' | 'openai' | 'gemini';
  const recoveryAudit =
    recoveryAuditResult.status === 'fulfilled'
      ? recoveryAuditResult.value.map(
          (row: TelemetryRow): RecoveryAuditEvent => ({ id: row.id, stage: row.stage, status: row.status, detail: row.detail, createdAt: row.createdAt.toISOString() })
        )
      : ([] as RecoveryAuditEvent[]);

  const hasPartialData = [importFlagResult, drainFlagResult, activeConfigResult, activeModelResult, recentTelemetryResult, recoveryAuditResult, aiProviderSettingResult].some(
    (result) => result.status === 'rejected'
  );

  const importEnabled = importFlag?.value === 'true';
  const drainMode = drainFlag?.value === 'true';
  const latestReplayRequest = recoveryAudit.find((entry: RecoveryAuditEvent) => entry.stage === 'recovery_replay_request');

  const staleTelemetryMinutes = recentTelemetry[0] ? Math.floor((Date.now() - new Date(recentTelemetry[0].createdAt).getTime()) / 60000) : null;
  const slaState = staleTelemetryMinutes === null ? 'unknown' : staleTelemetryMinutes > 180 ? 'breached' : staleTelemetryMinutes > 120 ? 'at_risk' : 'healthy';
  const apiKeyGroups = getApiKeyStatuses();
  const aiKeys = apiKeyGroups.find((g) => g.group === 'AI extraction')?.keys ?? [];

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
          {RECOVERY_STATES.map((key: RecoveryState) => (
            <div key={key} className="recovery-action-item">
              <p>
                <RecoveryStateBadge state={key} />
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
        <DataTable<TelemetryRow>
          rows={recentTelemetry}
          rowKey={(row: TelemetryRow) => row.id}
          emptyState={<EmptyState title="No telemetry" description="No telemetry rows are currently available." />}
          columns={[
            { key: 'stage', header: 'Stage', render: (row: TelemetryRow) => row.stage },
            {
              key: 'status',
              header: 'Status',
              render: (row: TelemetryRow) => (
                <StatusBadge tone={row.status === 'success' ? 'success' : row.status === 'failure' ? 'danger' : 'warning'}>
                  {row.status}
                </StatusBadge>
              )
            },
            { key: 'detail', header: 'Detail', render: (row: TelemetryRow) => row.detail || '—' },
            { key: 'createdAt', header: 'Time', render: (row: TelemetryRow) => new Date(row.createdAt).toLocaleString() }
          ]}
        />
      </SectionCard>

      <SectionCard title="Recovery action audit" subtitle="Actor, reason, scope, and outcome for replay/retry/pause/resume controls.">
        <RecoveryAuditFeed events={recoveryAudit} hasGaps={hasPartialData || recoveryAudit.some((event: RecoveryAuditEvent) => !event.detail)} />
      </SectionCard>



      <SectionCard
        title="AI extraction provider"
        subtitle="Select which AI provider powers field extraction in the intake pipeline. The selected provider must have its API key configured."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' }}>
          {(['anthropic', 'openai', 'gemini'] as const).map((provider) => {
            const labels: Record<string, string> = {
              anthropic: 'Anthropic (Claude)',
              openai: 'OpenAI (GPT)',
              gemini: 'Google Gemini'
            };
            const envVars: Record<string, string> = {
              anthropic: 'ANTHROPIC_API_KEY',
              openai: 'OPENAI_API_KEY',
              gemini: 'GEMINI_API_KEY'
            };
            const keyPresent = aiKeys.find((k) => k.envVar === envVars[provider])?.present ?? false;
            const isActive = activeProvider === provider;
            return (
              <div
                key={provider}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                  borderRadius: 6,
                  border: `1px solid ${isActive ? 'var(--primary)' : 'var(--border)'}`,
                  background: isActive ? 'var(--primary-soft)' : 'var(--surface)'
                }}
              >
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 500, fontSize: 14 }}>{labels[provider]}</span>
                  {' '}
                  <code style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {envVars[provider]}
                  </code>
                </div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: keyPresent ? 'var(--success-soft)' : 'var(--surface-muted)',
                    color: keyPresent ? 'var(--success)' : 'var(--text-muted)'
                  }}
                >
                  {keyPresent ? 'Key configured' : 'Key missing'}
                </span>
                {isActive ? (
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--primary)', minWidth: 80, textAlign: 'right' }}>
                    Active
                  </span>
                ) : (
                  <form
                    action="/api/admin/config/ai-provider"
                    method="POST"
                    style={{ minWidth: 80, textAlign: 'right' }}
                  >
                    <input type="hidden" name="provider" value={provider} />
                    <button
                      type="submit"
                      disabled={!keyPresent}
                      style={{
                        fontSize: 12,
                        padding: '4px 12px',
                        borderRadius: 4,
                        border: '1px solid var(--border)',
                        background: 'var(--surface)',
                        cursor: keyPresent ? 'pointer' : 'not-allowed',
                        color: keyPresent ? 'var(--text)' : 'var(--text-muted)'
                      }}
                    >
                      Use this
                    </button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>
          Provider selection takes effect on the next intake run. Add missing keys in Vercel → Settings → Environment Variables, then redeploy.
        </p>
      </SectionCard>

      <SectionCard
        title="API key status"
        subtitle="Read-only environment readiness checks. Values are never displayed, only whether each key is present."
      >
        <div style={{ display: 'grid', gap: 24 }}>
          {apiKeyGroups.map((group) => (
            <section key={group.group}>
              <h3 style={{ fontSize: 16, fontWeight: 500, marginBottom: 12 }}>{group.group}</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                    <th style={{ padding: '6px 12px 6px 0', fontWeight: 500, width: '22%' }}>Key</th>
                    <th style={{ padding: '6px 12px', fontWeight: 500, width: '12%' }}>Status</th>
                    <th style={{ padding: '6px 12px', fontWeight: 500, width: '20%' }}>Env var</th>
                    <th style={{ padding: '6px 12px', fontWeight: 500 }}>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {group.keys.map((key) => (
                    <tr key={key.envVar} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 12px 10px 0', fontWeight: 500 }}>
                        {key.name}
                        {key.docsUrl ? (
                          <>
                            {' '}
                            <a
                              href={key.docsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ fontSize: 12, color: 'var(--primary)', textDecoration: 'none' }}
                            >
                              Get key →
                            </a>
                          </>
                        ) : null}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: 12,
                            fontWeight: 500,
                            background: key.present ? 'var(--success-soft)' : 'var(--danger-soft)',
                            color: key.present ? 'var(--success)' : 'var(--danger)'
                          }}
                        >
                          {key.present ? 'Configured' : 'Not set'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <code
                          style={{
                            fontSize: 12,
                            background: 'var(--surface-muted)',
                            padding: '2px 6px',
                            borderRadius: 4,
                            border: '1px solid var(--border)'
                          }}
                        >
                          {key.envVar}
                        </code>
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{key.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 16 }}>
          To add or update a key: go to your Vercel project → Settings → Environment Variables → add the env var name shown above → redeploy.
        </p>
      </SectionCard>
    </div>
  );
}
