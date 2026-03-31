'use client';

import { useState } from 'react';
import { SectionCard } from '@/components/admin';

export function RollbackPreviewPanel({ eventId, versions }: { eventId: string; versions: Array<{ versionNumber: number; createdAt: string; changeSummary: string | null }> }) {
  const [targetVersion, setTargetVersion] = useState<number>(versions[0]?.versionNumber ?? 1);
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<Record<string, [unknown, unknown]> | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadPreview() {
    setLoading(true);
    const response = await fetch(`/api/admin/publish/${eventId}/rollback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ versionNumber: targetVersion, reason: reason || 'preview', preview: true })
    });
    setLoading(false);
    if (!response.ok) return;
    const payload = (await response.json()) as { preview?: { changes?: Record<string, [unknown, unknown]> } };
    setPreview(payload.preview?.changes ?? null);
  }

  return (
    <SectionCard title="Rollback preview" subtitle="Inspect impact before executing a destructive rollback.">
      <div className="stack">
        <div className="filters-row">
          <select className="select" value={targetVersion} onChange={(event) => setTargetVersion(Number(event.target.value))}>
            {versions.map((version) => (
              <option key={version.versionNumber} value={version.versionNumber}>
                v{version.versionNumber} · {new Date(version.createdAt).toLocaleString()}
              </option>
            ))}
          </select>
          <input className="input" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Rollback reason" />
          <button type="button" className="action-button variant-secondary" onClick={() => void loadPreview()} disabled={loading}>
            {loading ? 'Loading…' : 'Preview rollback'}
          </button>
        </div>

        {preview ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>Current</th>
                <th>After rollback</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(preview).map(([field, values]) => (
                <tr key={field}>
                  <td>{field}</td>
                  <td>{String(values[0] ?? '—')}</td>
                  <td>{String(values[1] ?? '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">Run preview to inspect field-level rollback impact.</p>
        )}
      </div>
    </SectionCard>
  );
}
