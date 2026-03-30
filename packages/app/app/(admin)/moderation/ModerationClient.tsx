'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertBanner, ConfirmDialog, SectionCard, ToastRegion, type ToastMessage } from '@/components/admin';
import {
  ModerationDetailPanel,
  ModerationFilterBar,
  ModerationQueueTable,
  type CandidateDetail,
  type QueueCandidate
} from '@/components/admin/moderation';

const REJECT_REASONS = [
  'Duplicate / already exists',
  'Insufficient event evidence',
  'Broken or inaccessible source URL',
  'Out of scope for platform policy',
  'Low confidence / unverifiable details'
] as const;

function readFilterState(searchParams: { get: (key: string) => string | null }) {
  return {
    q: searchParams.get('q') ?? '',
    platform: searchParams.get('platform') ?? 'all',
    status: searchParams.get('status') ?? 'PENDING',
    confidence: searchParams.get('confidence') ?? 'all',
    selected: searchParams.get('selected'),
    detail: searchParams.get('detail') === 'open'
  };
}

export function ModerationClient({
  initialItems,
  failureCount
}: {
  initialItems: QueueCandidate[];
  failureCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [items, setItems] = useState<QueueCandidate[]>(initialItems);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'approve' | 'reject' | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [confirmRejectFor, setConfirmRejectFor] = useState<string | null>(null);
  const [selectedRejectReason, setSelectedRejectReason] = useState<string>('');
  const [rejectNote, setRejectNote] = useState('');
  const [queueError, setQueueError] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<CandidateDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const filterState = readFilterState(searchParams);

  const selectedId = filterState.selected ?? items[0]?.id ?? null;
  const detailOpen = filterState.detail;

  const selected = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);
  const hasActiveFilters = Boolean(filterState.q || filterState.platform !== 'all' || filterState.status !== 'PENDING' || filterState.confidence !== 'all');
  const platforms = useMemo(() => Array.from(new Set(items.map((item) => item.source))).sort(), [items]);

  useEffect(() => {
    let ignore = false;

    async function loadQueue() {
      try {
        const params = new URLSearchParams({ pageSize: '100', sort: 'confidenceScore', order: 'desc' });
        if (filterState.q) params.set('search', filterState.q);
        if (filterState.platform !== 'all') params.set('source', filterState.platform);
        if (filterState.status !== 'all') params.set('status', filterState.status);
        if (filterState.confidence !== 'all') params.set('band', filterState.confidence);

        const res = await fetch(`/api/admin/moderation/events?${params.toString()}`, { cache: 'no-store' });
        if (!res.ok) {
          throw new Error(`Queue request failed (${res.status})`);
        }
        const payload = (await res.json()) as { data: QueueCandidate[] };
        if (ignore) return;
        setItems(payload.data);
        setQueueError(null);
      } catch (error) {
        if (ignore) return;
        setQueueError(error instanceof Error ? error.message : 'Unable to refresh moderation queue.');
      }
    }

    void loadQueue();
    return () => {
      ignore = true;
    };
  }, [filterState.confidence, filterState.platform, filterState.q, filterState.status]);

  useEffect(() => {
    if (!selectedId) return;
    const params = new URLSearchParams(searchParams.toString());
    let changed = false;

    if (!params.get('selected') && items.length > 0) {
      params.set('selected', items[0].id);
      changed = true;
    }

    if (selectedId && !items.some((item) => item.id === selectedId) && items.length > 0) {
      params.set('selected', items[0].id);
      changed = true;
    }

    if (changed) {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
  }, [items, pathname, router, searchParams, selectedId]);

  useEffect(() => {
    if (!selectedId || !detailOpen) {
      setDetailData(null);
      return;
    }

    let ignore = false;

    async function loadDetail() {
      setDetailLoading(true);
      try {
        const res = await fetch(`/api/admin/moderation/events/${selectedId}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Detail request failed (${res.status})`);
        const payload = (await res.json()) as {
          data: CandidateDetail;
        };
        if (!ignore) setDetailData(payload.data);
      } catch {
        if (!ignore) {
          setDetailData(null);
          pushToast({ tone: 'error', title: 'Could not load detail panel.' });
        }
      } finally {
        if (!ignore) setDetailLoading(false);
      }
    }

    void loadDetail();
    return () => {
      ignore = true;
    };
  }, [detailOpen, selectedId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const tagName = (event.target as HTMLElement | null)?.tagName ?? '';
      const inTypingField = tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';

      if (event.key === '/') {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (!items.length) return;
      const currentIndex = items.findIndex((item) => item.id === selectedId);

      if (event.key.toLowerCase() === 'j' && !inTypingField) {
        event.preventDefault();
        const target = items[Math.min(currentIndex + 1, items.length - 1)] ?? items[0];
        syncUrl({ selected: target.id });
      }
      if (event.key.toLowerCase() === 'k' && !inTypingField) {
        event.preventDefault();
        const safeIndex = currentIndex <= 0 ? 0 : currentIndex - 1;
        const target = items[safeIndex] ?? items[0];
        syncUrl({ selected: target.id });
      }
      if (event.key === 'Enter' && !inTypingField && selectedId) {
        event.preventDefault();
        syncUrl({ detail: 'open' });
      }
      if (event.key === 'Escape' && detailOpen) {
        event.preventDefault();
        syncUrl({ detail: null });
      }
      if (event.key.toLowerCase() === 'a' && !inTypingField && selectedId) {
        event.preventDefault();
        void moderate(selectedId, 'approve');
      }
      if (event.key.toLowerCase() === 'r' && !inTypingField && selectedId) {
        event.preventDefault();
        setConfirmRejectFor(selectedId);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [detailOpen, items, selectedId]);

  function syncUrl(updates: Partial<Record<'q' | 'platform' | 'status' | 'confidence' | 'selected' | 'detail', string | null>>) {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(updates)) {
      if (!value || value === 'all' || (key === 'status' && value === 'PENDING')) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }

    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }

  async function moderate(id: string, action: 'approve' | 'reject') {
    setSubmittingId(id);
    setBusyAction(action);

    const currentIndex = items.findIndex((item) => item.id === id);

    try {
      if (action === 'reject' && !selectedRejectReason) {
        pushToast({ tone: 'error', title: 'Reject reason is required before submitting.' });
        return;
      }

      const route = action === 'approve' ? 'approve' : 'reject';
      const payload =
        action === 'approve'
          ? { expectedStatus: 'PENDING' }
          : { expectedStatus: 'PENDING', reasonCode: selectedRejectReason, note: rejectNote.trim() || undefined };

      const res = await fetch(`/api/admin/moderation/events/${id}/${route}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (!res.ok) {
        if (res.status === 409) {
          pushToast({ tone: 'error', title: 'Status conflict detected.', description: body.error ?? 'Candidate changed status.' });
          return;
        }
        throw new Error(body.error ?? `Action failed with status ${res.status}`);
      }

      const remaining = items.filter((item) => item.id !== id);
      setItems(remaining);
      const next = remaining[currentIndex] ?? remaining[Math.max(0, currentIndex - 1)] ?? null;
      syncUrl({ selected: next?.id ?? null, detail: next ? (detailOpen ? 'open' : null) : null });
      setSelectedRejectReason('');
      setRejectNote('');
      pushToast({ tone: 'success', title: `Candidate ${action === 'approve' ? 'approved' : 'rejected'} successfully.` });
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
          {failureCount} failed stage executions were recorded in the past 24 hours. Use stricter review and escalate uncertain records.
        </AlertBanner>
      ) : null}

      <div className="two-col">
        <SectionCard title="Moderation Queue" subtitle="Keyboard-first queue: j/k navigate, Enter open, Esc close, a approve, r reject, / search.">
          <ModerationFilterBar
            filters={{
              q: filterState.q,
              platform: filterState.platform,
              status: filterState.status,
              confidence: filterState.confidence
            }}
            platforms={platforms}
            onChange={(next) => syncUrl(next)}
            searchInputRef={searchInputRef}
          />

          <ToastRegion messages={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((message) => message.id !== id))} />

          <ModerationQueueTable
            rows={items}
            hasAnyItems={!hasActiveFilters}
            queueError={queueError}
            selectedId={selectedId}
            submittingId={submittingId}
            busyAction={busyAction}
            onSelect={(id) => syncUrl({ selected: id })}
            onApprove={(id) => void moderate(id, 'approve')}
            onReject={(id) => setConfirmRejectFor(id)}
          />
        </SectionCard>

        <SectionCard title="Candidate Detail" subtitle="Deep context for safer decisions and quick investigation handoff.">
          <ModerationDetailPanel selected={selected} detailOpen={detailOpen} detail={detailData} detailLoading={detailLoading} />
        </SectionCard>
      </div>

      <ConfirmDialog
        open={Boolean(confirmRejectFor)}
        title="Reject candidate?"
        body="Provide a structured reason. Add optional context before confirming."
        tone="danger"
        confirmLabel="Reject candidate"
        onCancel={() => setConfirmRejectFor(null)}
        submitting={busyAction === 'reject'}
        onConfirm={() => {
          if (!confirmRejectFor) return;
          if (!selectedRejectReason) {
            pushToast({ tone: 'error', title: 'Reject reason is required before submitting.' });
            return;
          }
          void moderate(confirmRejectFor, 'reject');
        }}
      >
        <label className="stack">
          <span className="muted">Reason (required)</span>
          <select className="select" value={selectedRejectReason} onChange={(event) => setSelectedRejectReason(event.target.value)}>
            <option value="">Select reason</option>
            {REJECT_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {reason}
              </option>
            ))}
          </select>
        </label>
        <label className="stack">
          <span className="muted">Moderator note (optional)</span>
          <textarea
            className="input"
            rows={3}
            value={rejectNote}
            onChange={(event) => setRejectNote(event.target.value)}
            placeholder="Ticket, evidence, or additional context."
          />
        </label>
      </ConfirmDialog>
    </div>
  );
}
