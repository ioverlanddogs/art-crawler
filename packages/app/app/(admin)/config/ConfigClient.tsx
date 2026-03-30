'use client';

import { useState } from 'react';
import { ActionButton, DataTable, EmptyState, SectionCard, StatusBadge } from '@/components/admin';

type ConfigVersion = {
  id: string;
  version: number;
  isActive: boolean;
  createdAt: string;
};

export function ConfigClient({ initialVersions }: { initialVersions: ConfigVersion[] }) {
  const [versions, setVersions] = useState(initialVersions);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function activateVersion(id: string, version: number) {
    if (!confirm(`Activate config version ${version}?`)) return;
    setSubmittingId(id);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/admin/config/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      if (!res.ok) throw new Error(`Activate failed with status ${res.status}`);
      setVersions((prev) => prev.map((item) => ({ ...item, isActive: item.id === id })));
      setMessage(`Version ${version} is now active.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSubmittingId(null);
    }
  }

  return (
    <SectionCard title="Config Versions" subtitle="Activate a configuration version used by the pipeline.">
      {message ? <p className="muted">Success: {message}</p> : null}
      {error ? <p className="muted">Error: {error}</p> : null}
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
                submitting={submittingId === row.id}
                disabled={row.isActive}
                onClick={() => activateVersion(row.id, row.version)}
              >
                {row.isActive ? 'Active' : 'Activate'}
              </ActionButton>
            )
          }
        ]}
      />
    </SectionCard>
  );
}
