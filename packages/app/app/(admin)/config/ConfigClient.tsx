'use client';

import { useState } from 'react';
import { ActionButton, AlertBanner, DataTable, EmptyState, SectionCard, StatusBadge } from '@/components/admin';

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
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [changeReason, setChangeReason] = useState('');
  const [confirmText, setConfirmText] = useState('');

  async function activateVersion(id: string, version: number) {
    if (confirmText.trim() !== 'ACTIVATE') {
      setError('Type ACTIVATE to confirm config promotion.');
      return;
    }
    setSubmittingId(id);
    setSubmittingAction('activate');
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/admin/config/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, reason: changeReason, confirmText: 'ACTIVATE' })
      });
      if (!res.ok) throw new Error(`Activate failed with status ${res.status}`);
      setVersions((prev) => prev.map((item) => ({ ...item, isActive: item.id === id })));
      setMessage(`Version ${version} is now active.`);
      setConfirmText('');
      setChangeReason('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSubmittingId(null);
      setSubmittingAction(null);
    }
  }

  async function promoteModel(id: string, version: string) {
    if (confirmText.trim() !== 'PROMOTE') {
      setError('Type PROMOTE to confirm model promotion.');
      return;
    }
    setSubmittingId(id);
    setSubmittingAction('promote');
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/models/${id}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: changeReason, confirmText: 'PROMOTE' })
      });
      if (!res.ok) throw new Error(`Promote failed with status ${res.status}`);
      setModels((prev) => prev.map((item) => ({ ...item, isActive: item.id === id, isShadow: item.id === id ? false : item.isShadow })));
      setMessage(`Model ${version} is now active.`);
      setConfirmText('');
      setChangeReason('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSubmittingId(null);
      setSubmittingAction(null);
    }
  }

  return (
    <div className="stack">
      <AlertBanner tone="warning" title="Safe controls only">
        Config activation and model promotion are manual operations. Investigate active failures before changing production behavior.
      </AlertBanner>
      {message ? <p className="muted">Success: {message}</p> : null}
      {error ? <p className="muted">Error: {error}</p> : null}
      <SectionCard title="Change Safety Gate" subtitle="Every sensitive change requires a reason and typed confirmation token.">
        <div className="stack">
          <textarea
            className="input"
            rows={3}
            value={changeReason}
            onChange={(event) => setChangeReason(event.target.value)}
            placeholder="Why is this change needed? Include incident/ticket/context."
          />
          <input
            className="input"
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            placeholder="Type ACTIVATE for config or PROMOTE for model"
          />
        </div>
      </SectionCard>
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
                    disabled={row.isActive || changeReason.trim().length < 8}
                    onClick={() => activateVersion(row.id, row.version)}
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
                    disabled={row.isActive || changeReason.trim().length < 8}
                    onClick={() => promoteModel(row.id, row.version)}
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
    </div>
  );
}
