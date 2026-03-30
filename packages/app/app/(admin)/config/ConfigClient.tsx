'use client';

import { useMemo, useState } from 'react';
import {
  ActionButton,
  AlertBanner,
  AuditLogTable,
  ChangeImpactNotice,
  ConfigDiffSummary,
  ConfirmDialog,
  DataTable,
  EmptyState,
  GovernanceStateBadge,
  ModelSummaryCard,
  SectionCard,
  ToastRegion,
  type AuditLogItem,
  type GovernanceState,
  type ToastMessage
} from '@/components/admin';

type ConfigVersion = {
  id: string;
  region?: string | null;
  version: number;
  status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED' | string;
  isActive?: boolean;
  configJson?: unknown;
  changeReason?: string | null;
  activatedAt?: string | Date | null;
  activatedBy?: string | null;
  createdAt: string | Date;
  createdBy?: string | null;
};

type ModelVersion = {
  id: string;
  entityType?: string;
  name: string;
  version: string;
  status?: 'SHADOW' | 'ACTIVE' | 'ARCHIVED' | string;
  isActive?: boolean;
  isShadow?: boolean;
  promotedAt?: string | Date | null;
  promotedBy?: string | null;
  shadowMetrics?: unknown;
  createdAt?: string | Date;
};

type AuditEvent = {
  id: string;
  stage: string;
  status?: string;
  detail: string | null;
  createdAt: string | Date;
};

function parseDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function kvFromDetail(detail: string | null) {
  const source = detail || '';
  const map: Record<string, string> = {};
  for (const segment of source.split(';')) {
    const [key, ...rest] = segment.split('=');
    if (!key || !rest.length) continue;
    map[key.trim()] = rest.join('=').trim();
  }
  return map;
}

function deriveConfigState(version: ConfigVersion): GovernanceState {
  if (version.isActive || version.status === 'ACTIVE') return 'active';
  if (version.status === 'DRAFT') return 'pending';
  if (version.status === 'ARCHIVED') return 'superseded';
  return 'unknown';
}

function deriveModelState(model: ModelVersion): GovernanceState {
  if (model.isActive || model.status === 'ACTIVE') return 'active';
  if (model.isShadow || model.status === 'SHADOW') return 'pending';
  if (model.status === 'ARCHIVED') return 'superseded';
  return 'unknown';
}

function deriveAuditState(event: AuditEvent): GovernanceState {
  const lowered = (event.status || '').toLowerCase();
  if (!event.detail) return 'incomplete_context';
  if (lowered.includes('fail') || event.stage.includes('failed')) return 'failed';
  if (event.stage.includes('rollback')) return 'rolled_back';
  if (lowered.includes('success')) return 'active';
  if (lowered.includes('pending')) return 'pending';
  return 'unknown';
}

export function ConfigClient({
  initialVersions,
  initialModels,
  auditEvents,
  hasPartialData
}: {
  initialVersions: ConfigVersion[];
  initialModels: ModelVersion[];
  auditEvents: AuditEvent[];
  hasPartialData: boolean;
}) {
  const [versions, setVersions] = useState(initialVersions);
  const [models, setModels] = useState(initialModels);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [submittingAction, setSubmittingAction] = useState<'activate' | 'promote' | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [confirmState, setConfirmState] = useState<
    | null
    | { mode: 'activate'; id: string; version: number }
    | { mode: 'promote'; id: string; version: string; modelName: string }
  >(null);

  const sortedVersions = useMemo(() => [...versions].sort((a, b) => b.version - a.version), [versions]);
  const activeVersion = sortedVersions.find((item) => deriveConfigState(item) === 'active') || null;
  const previousVersion = sortedVersions.find((item) => item.id !== activeVersion?.id) || null;

  const activeModel = useMemo(() => models.find((item) => deriveModelState(item) === 'active') || null, [models]);
  const shadowModel = useMemo(() => models.find((item) => item.id !== activeModel?.id && (item.isShadow || item.status === 'SHADOW')) || null, [activeModel?.id, models]);

  const auditRows = useMemo<AuditLogItem[]>(() => {
    return auditEvents.map((event) => {
      const kv = kvFromDetail(event.detail);
      const action = event.stage.replaceAll('_', ' ');
      const target = kv.version ? `Config v${kv.version}` : kv.model ? kv.model : kv.target || 'System control plane';
      const actor = kv.actor || 'Unknown actor';
      const reason = kv.reason || null;
      const state = deriveAuditState(event);
      return {
        id: event.id,
        createdAt: new Date(event.createdAt).toISOString(),
        actor,
        action,
        target,
        reason,
        outcome: state.replaceAll('_', ' '),
        rawDetail: event.detail,
        incompleteContext: state === 'incomplete_context'
      };
    });
  }, [auditEvents]);

  const activationHistory = useMemo(
    () => auditRows.filter((event) => event.action.includes('config activate') || event.action.includes('config rollback')).slice(0, 8),
    [auditRows]
  );

  const promotionHistory = useMemo(
    () => auditRows.filter((event) => event.action.includes('model promote') || event.action.includes('model rollback')).slice(0, 8),
    [auditRows]
  );

  function pushToast(message: Omit<ToastMessage, 'id'>) {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((prev) => [...prev, { id, ...message }]);
  }

  async function activateVersion(id: string, version: number, reason?: string, confirmText?: string) {
    setSubmittingId(id);
    setSubmittingAction('activate');
    try {
      const res = await fetch('/api/admin/config/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, reason, confirmText })
      });
      if (!res.ok) throw new Error(`Activate failed with status ${res.status}`);
      setVersions((prev) => prev.map((item) => ({ ...item, isActive: item.id === id, status: item.id === id ? 'ACTIVE' : item.status })));
      pushToast({ tone: 'success', title: `Config version ${version} is now active.` });
    } catch (err) {
      pushToast({ tone: 'error', title: 'Config activation failed.', description: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setSubmittingId(null);
      setSubmittingAction(null);
      setConfirmState(null);
    }
  }

  async function promoteModel(id: string, version: string, reason?: string, confirmText?: string) {
    setSubmittingId(id);
    setSubmittingAction('promote');
    try {
      const res = await fetch(`/api/admin/models/${id}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, confirmText })
      });
      if (!res.ok) throw new Error(`Promote failed with status ${res.status}`);
      setModels((prev) => prev.map((item) => ({ ...item, isActive: item.id === id, isShadow: item.id === id ? false : item.isShadow, status: item.id === id ? 'ACTIVE' : item.status })));
      pushToast({ tone: 'success', title: `Model ${version} is now live.` });
    } catch (err) {
      pushToast({ tone: 'error', title: 'Model promotion failed.', description: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setSubmittingId(null);
      setSubmittingAction(null);
      setConfirmState(null);
    }
  }

  return (
    <div className="stack">
      <AlertBanner tone="warning" title="Global controls — production impact">
        Activating config or promoting a model changes system behavior across new pipeline runs. These are deliberate actions with required reasons.
      </AlertBanner>
      <ToastRegion messages={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((message) => message.id !== id))} />

      <section className="two-col" aria-label="Current governance state">
        <SectionCard title="Active config summary" subtitle="Current version and change context for pipeline behavior.">
          {activeVersion ? (
            <div className="stack">
              <p>
                <strong>Config v{activeVersion.version}</strong> <GovernanceStateBadge state={deriveConfigState(activeVersion)} />
              </p>
              <p className="muted">Region: {activeVersion.region || 'global'} · Activated: {parseDate(activeVersion.activatedAt)}</p>
              <p className="muted">Activated by: {activeVersion.activatedBy || 'Unknown actor'} · Change reason: {activeVersion.changeReason || 'Not recorded'}</p>
              <ConfigDiffSummary current={activeVersion.configJson} previous={previousVersion?.configJson} />
            </div>
          ) : (
            <EmptyState title="No active config detected" description="Activate a config version to establish an active baseline." />
          )}
        </SectionCard>

        <SectionCard title="Model operations summary" subtitle="Live and shadow model visibility with manual promotion policy.">
          <ChangeImpactNotice
            title="Shadow model policy"
            tone="info"
            bullets={[
              'Shadow models collect comparison metrics but never auto-promote.',
              'Promotion is a manual global action with typed confirmation.',
              'Rollback may require re-promoting a known-safe prior model version.'
            ]}
            footer={<a href="#audit-log" className="inline-link">Review promotion history in audit log</a>}
          />
          <div className="stack">
            <ModelSummaryCard
              summary={{
                label: 'Live model',
                name: activeModel?.name || 'No live model',
                version: activeModel?.version || '—',
                promotedAt: activeModel?.promotedAt ? new Date(activeModel.promotedAt).toISOString() : null,
                promotedBy: activeModel?.promotedBy,
                status: activeModel ? deriveModelState(activeModel) : 'unknown',
                shadowMetrics: activeModel?.shadowMetrics
              }}
            />
            <ModelSummaryCard
              summary={{
                label: 'Shadow model',
                name: shadowModel?.name || 'No shadow model',
                version: shadowModel?.version || '—',
                promotedAt: shadowModel?.promotedAt ? new Date(shadowModel.promotedAt).toISOString() : null,
                promotedBy: shadowModel?.promotedBy,
                status: shadowModel ? deriveModelState(shadowModel) : 'incomplete_context',
                shadowMetrics: shadowModel?.shadowMetrics
              }}
            />
          </div>
        </SectionCard>
      </section>

      <div className="two-col">
        <SectionCard title="Config versions" subtitle="Governed versions, metadata, and activation actions.">
          <ChangeImpactNotice
            title="Before activation"
            tone="danger"
            bullets={[
              'This changes defaults for all future pipeline jobs.',
              'Validate diffs and incident context before activating.',
              'If rollback is not available, re-activate the last known-safe version.'
            ]}
            footer={<a href="#audit-log" className="inline-link">Jump to config activation audit context</a>}
          />
          <DataTable
            rows={sortedVersions}
            rowKey={(row) => row.id}
            emptyState={<EmptyState title="No config versions" description="Create and publish a version to start governance controls." />}
            columns={[
              { key: 'version', header: 'Version', render: (row) => `v${row.version}` },
              { key: 'state', header: 'State', render: (row) => <GovernanceStateBadge state={deriveConfigState(row)} /> },
              { key: 'region', header: 'Region', render: (row) => row.region || 'global' },
              { key: 'created', header: 'Created', render: (row) => parseDate(row.createdAt) },
              { key: 'reason', header: 'Change reason', render: (row) => row.changeReason || 'No reason recorded' },
              {
                key: 'action',
                header: 'Global action',
                render: (row) => (
                  <ActionButton
                    variant="secondary"
                    submitting={submittingId === row.id && submittingAction === 'activate'}
                    disabled={deriveConfigState(row) === 'active' || submittingAction !== null}
                    onClick={() => setConfirmState({ mode: 'activate', id: row.id, version: row.version })}
                  >
                    {deriveConfigState(row) === 'active' ? 'Active now' : 'Activate globally'}
                  </ActionButton>
                )
              }
            ]}
          />
        </SectionCard>

        <SectionCard title="Model versions" subtitle="Manual promotion controls with offline metric context.">
          <DataTable
            rows={models}
            rowKey={(row) => row.id}
            emptyState={<EmptyState title="No model versions" description="Register model versions to manage live and shadow lifecycle." />}
            columns={[
              { key: 'name', header: 'Model', render: (row) => `${row.name} (${row.entityType || 'pipeline'})` },
              { key: 'version', header: 'Version', render: (row) => `v${row.version}` },
              { key: 'state', header: 'State', render: (row) => <GovernanceStateBadge state={deriveModelState(row)} /> },
              {
                key: 'metrics',
                header: 'Offline metrics snapshot',
                render: (row) => (row.shadowMetrics ? 'Available' : 'Unavailable')
              },
              {
                key: 'action',
                header: 'Global action',
                render: (row) => (
                  <ActionButton
                    variant="secondary"
                    submitting={submittingId === row.id && submittingAction === 'promote'}
                    disabled={deriveModelState(row) === 'active' || submittingAction !== null}
                    onClick={() => setConfirmState({ mode: 'promote', id: row.id, version: row.version, modelName: row.name })}
                  >
                    {deriveModelState(row) === 'active' ? 'Live now' : 'Promote to live'}
                  </ActionButton>
                )
              }
            ]}
          />
        </SectionCard>
      </div>

      <div className="two-col">
        <SectionCard title="Activation & rollback history" subtitle="Recent config activations and rollback guidance.">
          {!activationHistory.length ? (
            <EmptyState title="No activation history" description="No config governance actions have been recorded yet." />
          ) : (
            <ul className="timeline">
              {activationHistory.map((item) => (
                <li key={item.id}>
                  <p>
                    <strong>{item.action}</strong> · {new Date(item.createdAt).toLocaleString()}
                  </p>
                  <p className="muted">{item.target} · {item.actor}</p>
                  <p className="muted">Reason: {item.reason || 'No reason recorded'}</p>
                  <GovernanceStateBadge state={item.incompleteContext ? 'incomplete_context' : (item.outcome.replace(' ', '_') as GovernanceState)} />
                </li>
              ))}
            </ul>
          )}
          <AlertBanner tone="info" title="Rollback guidance">
            Direct rollback API support may be unavailable. To rollback safely, re-activate the last known-safe config version and monitor failures.
          </AlertBanner>
        </SectionCard>

        <SectionCard title="Promotion history" subtitle="Model promotion timeline and rollback guidance.">
          {!promotionHistory.length ? (
            <EmptyState title="No promotion history" description="No model promotions are recorded yet." />
          ) : (
            <ul className="timeline">
              {promotionHistory.map((item) => (
                <li key={item.id}>
                  <p>
                    <strong>{item.action}</strong> · {new Date(item.createdAt).toLocaleString()}
                  </p>
                  <p className="muted">{item.target} · {item.actor}</p>
                  <p className="muted">Reason: {item.reason || 'No reason recorded'}</p>
                  <GovernanceStateBadge state={item.incompleteContext ? 'incomplete_context' : (item.outcome.replace(' ', '_') as GovernanceState)} />
                </li>
              ))}
            </ul>
          )}
          <AlertBanner tone="info" title="Model rollback guidance">
            If a live model degrades quality, promote the last known-safe model version. Shadow models do not auto-promote.
          </AlertBanner>
        </SectionCard>
      </div>

      <SectionCard
        title="Audit and change history"
        subtitle="Who changed what, when, and why across config, model, moderation, and governance actions."
      >
        <AuditLogTable rows={auditRows} />
        {hasPartialData ? (
          <AlertBanner tone="warning" title="Incomplete context">
            Some audit sources are missing. Rows with unknown actor/reason are explicitly labeled as incomplete context.
          </AlertBanner>
        ) : null}
      </SectionCard>

      <ConfirmDialog
        open={confirmState !== null}
        title={confirmState?.mode === 'activate' ? 'Activate configuration globally?' : 'Promote model to live globally?'}
        body={
          confirmState?.mode === 'activate'
            ? `Config v${confirmState.version} becomes active for all future pipeline processing.`
            : `${confirmState?.modelName || 'This model'} v${confirmState?.version || ''} becomes the live scoring model.`
        }
        tone="danger"
        reasonRequired
        confirmToken={confirmState?.mode === 'activate' ? 'ACTIVATE' : 'PROMOTE'}
        confirmLabel={confirmState?.mode === 'activate' ? 'Activate globally' : 'Promote to live'}
        submitting={submittingAction !== null}
        onCancel={() => setConfirmState(null)}
        onConfirm={({ reason, confirmText }) => {
          if (!confirmState) return;
          if (confirmState.mode === 'activate') {
            void activateVersion(confirmState.id, confirmState.version, reason, confirmText);
            return;
          }
          void promoteModel(confirmState.id, confirmState.version, reason, confirmText);
        }}
      >
        <ChangeImpactNotice
          title="Impact check"
          tone="danger"
          bullets={
            confirmState?.mode === 'activate'
              ? [
                  'This affects every future pipeline run using active config.',
                  'Record an incident or ticket reference in the reason field.',
                  'If this fails, immediately re-activate a known-safe version.'
                ]
              : [
                  'This changes live scoring behavior for future imports.',
                  'Validate offline metrics and recent shadow results first.',
                  'Promotion is manual only; shadow models never auto-promote.'
                ]
          }
        />
      </ConfirmDialog>
    </div>
  );
}
