'use client';

import { useMemo, useState } from 'react';
import { ActionButton, AlertBanner, DataTable, EmptyState, SectionCard, StatusBadge } from '@/components/admin';

type Candidate = {
  id: string;
  title: string;
  sourceUrl: string;
  sourcePlatform: string;
  confidenceScore: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
};

export function ModerationClient({ initialItems, failureCount }: { initialItems: Candidate[]; failureCount: number }) {
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(initialItems[0]?.id ?? null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const visibleItems = useMemo(() => {
    return items
      .filter((item) => {
      const matchesQuery = item.title.toLowerCase().includes(query.toLowerCase()) || item.sourceUrl.includes(query);
      const matchesPlatform = platformFilter === 'all' || item.sourcePlatform === platformFilter;
      return matchesQuery && matchesPlatform;
      })
      .sort((a, b) => b.confidenceScore - a.confidenceScore);
  }, [items, platformFilter, query]);

  const selected = visibleItems.find((item) => item.id === selectedId) ?? null;
  const platforms = Array.from(new Set(items.map((item) => item.sourcePlatform))).sort();

  async function moderate(id: string, action: 'approve' | 'reject') {
    setSubmittingId(id);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/admin/moderation/${id}/${action}`, { method: 'POST' });
      if (!res.ok) throw new Error(`Action failed with status ${res.status}`);
      setItems((prev) => prev.filter((item) => item.id !== id));
      setSelectedId((prev) => (prev === id ? null : prev));
      setSuccess(`Candidate ${action === 'approve' ? 'approved' : 'rejected'} successfully.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSubmittingId(null);
    }
  }

  return (
    <div className="stack">
      {failureCount > 0 ? (
        <AlertBanner tone="warning" title="Pipeline degraded">
          {failureCount} failed stage executions were recorded in the past 24 hours. Prefer strict review and use the investigation workspace.
        </AlertBanner>
      ) : null}
      <div className="two-col">
      <SectionCard title="Moderation Queue" subtitle="Approve or reject pending candidates from mining imports.">
        <div className="filters-row">
          <input className="input" placeholder="Search title or URL" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select className="select" value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)}>
            <option value="all">All Platforms</option>
            {platforms.map((platform) => (
              <option key={platform} value={platform}>
                {platform}
              </option>
            ))}
          </select>
        </div>

        {error ? <p className="muted">Error: {error}</p> : null}
        {success ? <p className="muted">Success: {success}</p> : null}

        <DataTable
          rows={visibleItems}
          rowKey={(row) => row.id}
          emptyState={<EmptyState title="No queue items" description="No candidates matched your filters." />}
          columns={[
            {
              key: 'title',
              header: 'Candidate',
              render: (row) => (
                <button type="button" className="action-button variant-secondary" onClick={() => setSelectedId(row.id)}>
                  {row.title}
                </button>
              )
            },
            { key: 'platform', header: 'Platform', render: (row) => row.sourcePlatform },
            { key: 'score', header: 'Confidence', render: (row) => `${Math.round(row.confidenceScore * 100)}%` },
            { key: 'created', header: 'Received', render: (row) => new Date(row.createdAt).toLocaleString() },
            {
              key: 'actions',
              header: 'Actions',
              render: (row) => (
                <div className="filters-row">
                  <ActionButton submitting={submittingId === row.id} onClick={() => moderate(row.id, 'approve')}>
                    Approve
                  </ActionButton>
                  <ActionButton
                    variant="danger"
                    disabled={submittingId === row.id}
                    onClick={() => moderate(row.id, 'reject')}
                  >
                    Reject
                  </ActionButton>
                </div>
              )
            }
          ]}
        />
      </SectionCard>

      <SectionCard title="Detail Panel" subtitle="Quick detail view for selected candidate.">
        {!selected ? (
          <EmptyState title="No item selected" description="Select a candidate from the queue table to inspect details." />
        ) : (
          <div className="stack">
            <div>
              <p className="muted">Title</p>
              <p>{selected.title}</p>
            </div>
            <div>
              <p className="muted">Source</p>
              <a href={selected.sourceUrl} target="_blank" rel="noreferrer">
                {selected.sourceUrl}
              </a>
            </div>
            <div>
              <p className="muted">Platform</p>
              <p>{selected.sourcePlatform}</p>
            </div>
            <div>
              <p className="muted">Status</p>
              <StatusBadge tone="warning">{selected.status}</StatusBadge>
            </div>
            <div>
              <p className="muted">Received</p>
              <p>{new Date(selected.createdAt).toLocaleString()}</p>
            </div>
          </div>
        )}
      </SectionCard>
      </div>
    </div>
  );
}
