'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [platformFilter, setPlatformFilter] = useState(searchParams.get('platform') ?? 'all');
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('selected') ?? initialItems[0]?.id ?? null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'approve' | 'reject' | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [confirmRejectFor, setConfirmRejectFor] = useState<string | null>(null);

  const visibleItems = useMemo(() => {
    return items
      .filter((item) => {
      const matchesQuery = item.title.toLowerCase().includes(query.toLowerCase()) || item.sourceUrl.includes(query);
      const matchesPlatform = platformFilter === 'all' || item.sourcePlatform === platformFilter;
      return matchesQuery && matchesPlatform;
      })
      .sort((a, b) => b.confidenceScore - a.confidenceScore);
  }, [items, platformFilter, query]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    query ? params.set('q', query) : params.delete('q');
    platformFilter !== 'all' ? params.set('platform', platformFilter) : params.delete('platform');
    selectedId ? params.set('selected', selectedId) : params.delete('selected');
    const next = params.toString();
    const current = searchParams.toString();
    if (next !== current) {
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    }
  }, [pathname, platformFilter, query, router, searchParams, selectedId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!visibleItems.length) return;
      if (event.key === '/') {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      const currentIndex = visibleItems.findIndex((item) => item.id === selectedId);
      if (event.key.toLowerCase() === 'j') {
        const target = visibleItems[Math.min(currentIndex + 1, visibleItems.length - 1)] ?? visibleItems[0];
        setSelectedId(target.id);
      }
      if (event.key.toLowerCase() === 'k') {
        const safeIndex = currentIndex <= 0 ? 0 : currentIndex - 1;
        const target = visibleItems[safeIndex] ?? visibleItems[0];
        setSelectedId(target.id);
      }
      if (event.key.toLowerCase() === 'a' && selectedId) {
        void moderate(selectedId, 'approve');
      }
      if (event.key.toLowerCase() === 'r' && selectedId) {
        setConfirmRejectFor(selectedId);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId, visibleItems]);

  const selected = visibleItems.find((item) => item.id === selectedId) ?? null;
  const platforms = Array.from(new Set(items.map((item) => item.sourcePlatform))).sort();

  useEffect(() => {
    if (!selected && visibleItems.length > 0) {
      setSelectedId(visibleItems[0].id);
    }
  }, [selected, visibleItems]);

  async function moderate(id: string, action: 'approve' | 'reject', reasonOverride?: string) {
    setSubmittingId(id);
    setBusyAction(action);
    try {
      const res = await fetch(`/api/admin/moderation/${id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedStatus: 'PENDING',
          reason: action === 'reject' ? reasonOverride?.trim() || rejectReason.trim() || undefined : undefined
        })
      });
      if (!res.ok) throw new Error(`Action failed with status ${res.status}`);
      setItems((prev) => prev.filter((item) => item.id !== id));
      setSelectedId((prev) => (prev === id ? null : prev));
      pushToast({ tone: 'success', title: `Candidate ${action === 'approve' ? 'approved' : 'rejected'} successfully.` });
      setRejectReason('');
    } catch (err) {
      pushToast({
        tone: 'error',
        title: `Candidate ${action} failed.`,
        description: err instanceof Error ? err.message : 'Unknown error'
      });
    } finally {
      setSubmittingId(null);
      setBusyAction(null);
      setConfirmRejectFor(null);
    }
  }

  function pushToast(message: Omit<ToastMessage, 'id'>) {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((prev) => [...prev, { id, ...message }]);
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
          <input
            ref={searchInputRef}
            className="input"
            placeholder="Search title or URL (/)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select className="select" value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)}>
            <option value="all">All Platforms</option>
            {platforms.map((platform) => (
              <option key={platform} value={platform}>
                {platform}
              </option>
            ))}
          </select>
        </div>

        <ToastRegion messages={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((message) => message.id !== id))} />

        <DataTable
          rows={visibleItems}
          rowKey={(row) => row.id}
          emptyState={<EmptyState title="No queue items" description="No candidates matched your filters." />}
          columns={[
            {
              key: 'title',
              header: 'Candidate',
              render: (row) => (
                <button
                  type="button"
                  className={`action-button variant-secondary ${selectedId === row.id ? 'row-selected' : ''}`}
                  onClick={() => setSelectedId(row.id)}
                >
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
                  <ActionButton
                    submitting={submittingId === row.id && busyAction === 'approve'}
                    disabled={submittingId !== null}
                    onClick={() => moderate(row.id, 'approve')}
                  >
                    Approve
                  </ActionButton>
                  <ActionButton
                    variant="danger"
                    disabled={submittingId !== null}
                    submitting={submittingId === row.id && busyAction === 'reject'}
                    onClick={() => setConfirmRejectFor(row.id)}
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
              <p className="muted">Reject reason (optional)</p>
              <textarea
                className="input"
                value={rejectReason}
                rows={3}
                placeholder="Add review context for auditability."
                onChange={(event) => setRejectReason(event.target.value)}
              />
            </div>
            <div>
              <p className="muted">Received</p>
              <p>{new Date(selected.createdAt).toLocaleString()}</p>
            </div>
            <p className="muted">Keyboard: j/k move · a approve · r reject · / search</p>
          </div>
        )}
      </SectionCard>
      </div>
      <ConfirmDialog
        open={Boolean(confirmRejectFor)}
        title="Reject candidate?"
        body="This removes the item from the moderation queue. Add a reason to preserve reviewer context."
        tone="danger"
        reasonRequired
        confirmLabel="Reject Candidate"
        submitting={busyAction === 'reject'}
        onCancel={() => setConfirmRejectFor(null)}
        onConfirm={({ reason }) => {
          if (!confirmRejectFor) return;
          void moderate(confirmRejectFor, 'reject', reason);
        }}
      />
    </div>
  );
}
