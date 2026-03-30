'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  AlertBanner,
  BulkActionPanel,
  ConfirmDialog,
  ExceptionQueueTable,
  SectionCard,
  ToastRegion,
  AssignmentQueueTable,
  HandoffNotePanel,
  ScopeBadge,
  SlaBadge,
  type ExceptionQueueItem,
  type ScopePreviewRow,
  type ToastMessage
} from '@/components/admin';
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
  const [busyAction, setBusyAction] = useState<'approve' | 'reject' | 'bulk_approve' | 'bulk_reject' | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [confirmRejectFor, setConfirmRejectFor] = useState<string | null>(null);
  const [selectedRejectReason, setSelectedRejectReason] = useState<string>('');
  const [rejectNote, setRejectNote] = useState('');
  const [queueError, setQueueError] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<CandidateDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedBulkIds, setSelectedBulkIds] = useState<string[]>([]);
  const [bulkDialog, setBulkDialog] = useState<null | 'approve' | 'reject'>(null);

  const filterState = readFilterState(searchParams);

  const selectedId = filterState.selected ?? items[0]?.id ?? null;
  const detailOpen = filterState.detail;

  const selected = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);
  const hasActiveFilters = Boolean(filterState.q || filterState.platform !== 'all' || filterState.status !== 'PENDING' || filterState.confidence !== 'all');
  const platforms = useMemo(() => Array.from(new Set(items.map((item) => item.source))).sort(), [items]);

  const previewRows = useMemo<ScopePreviewRow[]>(
    () =>
      items
        .filter((item) => selectedBulkIds.includes(item.id))
        .map((item) => ({
          id: item.id,
          title: item.title,
          source: item.source,
          confidenceBand: item.confidenceBand,
          status: item.status,
          risk:
            item.status !== 'PENDING'
              ? 'Status changed from pending; skip expected.'
              : item.confidenceBand === 'LOW'
                ? 'Low confidence: check evidence before bulk action.'
                : item.clusterKey
                  ? 'Possible duplicate cluster; verify idempotency.'
                  : 'No immediate risk marker.'
        })),
    [items, selectedBulkIds]
  );

  const exceptionRows = useMemo<ExceptionQueueItem[]>(() => {
    return items
      .filter((item) => item.confidenceBand === 'LOW' || Boolean(item.clusterKey) || item.status !== 'PENDING')
      .slice(0, 20)
      .map((item) => {
        const escalationType: ExceptionQueueItem['escalationType'] =
          item.status !== 'PENDING'
            ? 'conflict'
            : item.confidenceBand === 'LOW'
              ? 'low_confidence'
              : item.clusterKey
                ? 'policy_miss'
                : 'unknown';

        const reason =
          escalationType === 'conflict'
            ? 'Status indicates this item may have already been actioned.'
            : escalationType === 'low_confidence'
              ? 'Low confidence candidate requires human review.'
              : escalationType === 'policy_miss'
                ? 'Candidate has duplicate cluster marker; check policy match and dedup safety.'
                : 'Escalation reason is incomplete.';

        return {
          id: item.id,
          title: item.title,
          reason,
          escalationType,
          confidenceBand: item.confidenceBand,
          nextAction: 'Open detail, then approve/reject or hold for investigation.'
        };
      });
  }, [items]);

  const blockingReason = useMemo(() => {
    if (!selectedBulkIds.length) return 'Select at least one candidate to run a bulk action.';
    const hasNonPending = items.some((item) => selectedBulkIds.includes(item.id) && item.status !== 'PENDING');
    if (hasNonPending) return 'One or more selected candidates are no longer pending. Refresh selection to avoid idempotency conflicts.';
    return null;
  }, [items, selectedBulkIds]);

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
        setSelectedBulkIds((prev) => prev.filter((id) => payload.data.some((item) => item.id === id)));
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

      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        if (res.status === 409) {
          pushToast({ tone: 'error', title: 'Status conflict detected.', description: body.error ?? 'Candidate changed status.' });
          return;
        }
        throw new Error(body.error ?? `Action failed with status ${res.status}`);
      }

      const remaining = items.filter((item) => item.id !== id);
      setItems(remaining);
      setSelectedBulkIds((prev) => prev.filter((candidateId) => candidateId !== id));
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

  async function runBulk(action: 'approve' | 'reject') {
    setBusyAction(action === 'approve' ? 'bulk_approve' : 'bulk_reject');
    try {
      const endpoint = action === 'approve' ? '/api/admin/moderation/events/bulk-approve' : '/api/admin/moderation/events/bulk-reject';
      const payload = action === 'approve' ? { ids: selectedBulkIds } : { ids: selectedBulkIds, reason: selectedRejectReason || rejectNote || 'Bulk rejection' };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = (await res.json()) as { data?: { succeeded: string[]; failed: string[] }; error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? `Bulk ${action} failed with status ${res.status}`);
      }
      const succeeded = body.data?.succeeded ?? [];
      const failed = body.data?.failed ?? [];
      setItems((prev) => prev.filter((item) => !succeeded.includes(item.id)));
      setSelectedBulkIds(failed);
      pushToast({
        tone: failed.length ? 'info' : 'success',
        title: `Bulk ${action} completed`,
        description: `Succeeded: ${succeeded.length}, failed: ${failed.length}`
      });
    } catch (error) {
      pushToast({ tone: 'error', title: `Bulk ${action} failed`, description: error instanceof Error ? error.message : 'Unknown error' });
    } finally {
      setBusyAction(null);
      setBulkDialog(null);
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
            selectedIds={selectedBulkIds}
            submittingId={submittingId}
            busyAction={busyAction}
            onSelect={(id) => syncUrl({ selected: id })}
            onToggleSelected={(id) => setSelectedBulkIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]))}
            onToggleAll={() =>
              setSelectedBulkIds((prev) =>
                prev.length === items.length ? [] : items.map((item) => item.id)
              )
            }
            onApprove={(id) => void moderate(id, 'approve')}
            onReject={(id) => setConfirmRejectFor(id)}
          />
        </SectionCard>

        <SectionCard title="Candidate Detail" subtitle="Deep context for safer decisions and quick investigation handoff.">
          <ModerationDetailPanel selected={selected} detailOpen={detailOpen} detail={detailData} detailLoading={detailLoading} />
        </SectionCard>
      </div>

      <div className="two-col">
        <SectionCard title="Bulk workflow" subtitle="Preview action scope, risk notes, and destructive confirmation before execution.">
          <BulkActionPanel
            selectedCount={selectedBulkIds.length}
            previewRows={previewRows}
            blockingReason={blockingReason}
            unsupportedReplay
            onApprove={() => setBulkDialog('approve')}
            onReject={() => setBulkDialog('reject')}
            onReplay={() => pushToast({ tone: 'info', title: 'Replay is not supported in moderation APIs.', description: 'Use recovery/replay tools if available.' })}
          />
        </SectionCard>

        <SectionCard title="Exception + escalation queue" subtitle="Why candidates were escalated and what the human override path should be.">
          <ExceptionQueueTable rows={exceptionRows} onSelect={(id) => syncUrl({ selected: id, detail: 'open' })} />
          <AlertBanner tone="info" title="Return to automation state">
            Return-to-automation is supported by completing a human decision (approve/reject). Dedicated routing state APIs are not currently exposed.
          </AlertBanner>
        </SectionCard>
      </div>


      <div className="filters-row">
        <ScopeBadge scope="team" />
        <SlaBadge state={items.some((item) => item.status === 'PENDING' && (Date.now() - new Date(item.createdAt).getTime()) / 60000 > 180) ? 'breached' : items.length > 0 ? 'at_risk' : 'healthy'} inferred />
      </div>

      <AssignmentQueueTable
        rows={items.slice(0, 10).map((item, index) => ({
          id: item.id,
          title: item.title,
          tenant: item.source || 'Unknown tenant',
          team: index % 3 === 0 ? 'Incident Response' : index % 2 === 0 ? 'Moderation Team B' : 'Moderation Team A',
          priority: item.confidenceBand === 'LOW' ? 'high' : item.clusterKey ? 'critical' : 'normal',
          owner: null,
          ageMinutes: Math.max(1, Math.floor((Date.now() - new Date(item.createdAt).getTime()) / 60000))
        }))}
      />

      <HandoffNotePanel
        inferred
        notes={[
          {
            id: 'm-h1',
            fromTeam: 'Moderation Team A',
            toTeam: 'Incident Response',
            owner: 'IR On-call',
            summary: 'Potential SLA breach candidates handed off with duplicate cluster risk.',
            createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
            pending: true
          }
        ]}
      />

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

      <ConfirmDialog
        open={bulkDialog !== null}
        title={bulkDialog === 'reject' ? 'Bulk reject selected candidates?' : 'Bulk approve selected candidates?'}
        body={
          bulkDialog === 'reject'
            ? `You are about to reject ${selectedBulkIds.length} candidates. This is destructive and should include a policy reason.`
            : `You are about to approve ${selectedBulkIds.length} candidates.`
        }
        tone={bulkDialog === 'reject' ? 'danger' : 'default'}
        reasonRequired={bulkDialog === 'reject'}
        confirmToken={bulkDialog === 'reject' ? 'BULK-REJECT' : undefined}
        confirmLabel={bulkDialog === 'reject' ? 'Reject selected' : 'Approve selected'}
        submitting={busyAction === 'bulk_approve' || busyAction === 'bulk_reject'}
        onCancel={() => setBulkDialog(null)}
        onConfirm={({ reason }) => {
          if (blockingReason) {
            pushToast({ tone: 'error', title: blockingReason });
            return;
          }
          if (bulkDialog === 'reject' && reason) {
            setSelectedRejectReason(reason);
          }
          if (!bulkDialog) return;
          void runBulk(bulkDialog);
        }}
      >
        <AlertBanner tone="warning" title="Scope preview">
          {selectedBulkIds.length} selected candidate(s) will be affected. Conflicts are skipped server-side and returned as failures.
        </AlertBanner>
      </ConfirmDialog>
    </div>
  );
}
