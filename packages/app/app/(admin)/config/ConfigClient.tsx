'use client';

import { useState } from 'react';
import {
  ActionButton,
  AlertBanner,
  ConfirmDialog,
  DataTable,
  EmptyState,
  SectionCard,
  StatusBadge,
  ToastRegion,
  type ToastMessage
} from '@/components/admin';

type ConfigVersion = {
  id: string;
  version: number;
  isActive: boolean;
  createdAt: string;
};

type ModelVersion = {
  id: string;
  name: string;
  version: string;
  isActive: boolean;
  isShadow: boolean;
};

type AuditEvent = {
  id: string;
  stage: string;
  detail: string | null;
  createdAt: string;
};

export function ConfigClient({
  initialVersions,
  initialModels,
  auditEvents
}: {
  initialVersions: ConfigVersion[];
  initialModels: ModelVersion[];
  auditEvents: AuditEvent[];
}) {
  const [versions, setVersions] = useState(initialVersions);
  const [models, setModels] = useState(initialModels);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [submittingAction, setSubmittingAction] = useState<'activate' | 'promote' | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [confirmState, setConfirmState] = useState<
    | null
    | { mode: 'activate'; id: string; version: number }
    | { mode: 'promote'; id: string; version: string }
  >(null);

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
      setVersions((prev) => prev.map((item) => ({ ...item, isActive: item.id === id })));
      pushToast({ tone: 'success', title: `Version ${version} is now active.` });
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
      setModels((prev) => prev.map((item) => ({ ...item, isActive: item.id === id, isShadow: item.id === id ? false : item.isShadow })));
      pushToast({ tone: 'success', title: `Model ${version} is now active.` });
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
      <AlertBanner tone="warning" title="Safe controls only">
        Config activation and model promotion are manual operations. Investigate active failures before changing production behavior.
      </AlertBanner>
      <ToastRegion messages={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((message) => message.id !== id))} />
      <div className="two-col">
        <SectionCard title="Config Versions" subtitle="Activate a configuration version used by the pipeline.">
          <DataTable
            rows={versions}
            rowKey={(row) => row.id}
            emptyState={<EmptyState title="No config versions" description="Create a version to begin managing pipeline config." />}
            columns={[
              { key: 'version', header: 'Version', render: (row) => row.version },
              {
                key: 'active',
                header: 'State',
                render: (row) => (row.isActive ? <StatusBadge tone="success">Active</StatusBadge> : <StatusBadge>Inactive</StatusBadge>)
              },
              { key: 'createdAt', header: 'Created', render: (row) => new Date(row.createdAt).toLocaleString() },
              {
                key: 'action',
                header: 'Action',
                render: (row) => (
                  <ActionButton
                    variant="secondary"
                    submitting={submittingId === row.id && submittingAction === 'activate'}
                    disabled={row.isActive || submittingAction !== null}
                    onClick={() => setConfirmState({ mode: 'activate', id: row.id, version: row.version })}
                  >
                    {row.isActive ? 'Active' : 'Activate'}
                  </ActionButton>
                )
              }
            ]}
          />
        </SectionCard>

        <SectionCard title="Model Versions" subtitle="Promote model versions manually; shadow models are never auto-promoted.">
          <DataTable
            rows={models}
            rowKey={(row) => row.id}
            emptyState={<EmptyState title="No models" description="No model versions are registered yet." />}
            columns={[
              { key: 'name', header: 'Name', render: (row) => row.name },
              { key: 'version', header: 'Version', render: (row) => row.version },
              {
                key: 'state',
                header: 'State',
                render: (row) =>
                  row.isActive ? (
                    <StatusBadge tone="success">Active</StatusBadge>
                  ) : row.isShadow ? (
                    <StatusBadge tone="warning">Shadow</StatusBadge>
                  ) : (
                    <StatusBadge>Inactive</StatusBadge>
                  )
              },
              {
                key: 'action',
                header: 'Action',
                render: (row) => (
                  <ActionButton
                    variant="secondary"
                    submitting={submittingId === row.id && submittingAction === 'promote'}
                    disabled={row.isActive || submittingAction !== null}
                    onClick={() => setConfirmState({ mode: 'promote', id: row.id, version: row.version })}
                  >
                    {row.isActive ? 'Active' : 'Promote'}
                  </ActionButton>
                )
              }
            ]}
          />
        </SectionCard>
      </div>

      <SectionCard title="Audit Trail" subtitle="Recent sensitive control actions for accountability and rollback investigations.">
        <DataTable
          rows={auditEvents}
          rowKey={(row) => row.id}
          emptyState={<EmptyState title="No control events" description="No config/model control actions have been recorded yet." />}
          columns={[
            { key: 'stage', header: 'Action', render: (row) => row.stage },
            { key: 'detail', header: 'Detail', render: (row) => row.detail || '—' },
            { key: 'time', header: 'When', render: (row) => new Date(row.createdAt).toLocaleString() }
          ]}
        />
      </SectionCard>
      <ConfirmDialog
        open={confirmState !== null}
        title={confirmState?.mode === 'activate' ? 'Activate config version?' : 'Promote model version?'}
        body={
          confirmState?.mode === 'activate'
            ? `Version ${confirmState.version} will become active immediately.`
            : `Model ${confirmState?.version || ''} will become the active scoring model.`
        }
        tone="danger"
        reasonRequired
        confirmToken={confirmState?.mode === 'activate' ? 'ACTIVATE' : 'PROMOTE'}
        confirmLabel={confirmState?.mode === 'activate' ? 'Activate Version' : 'Promote Model'}
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
      />
    </div>
  );
}
