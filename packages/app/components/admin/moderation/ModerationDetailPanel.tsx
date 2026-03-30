'use client';

import Link from 'next/link';
import { EmptyState, StatusBadge } from '@/components/admin';
import type { QueueCandidate } from './ModerationQueueTable';

export type CandidateDetail = {
  confidenceReasons?: unknown;
  configVersion: number | null;
  createdAt: string;
  updatedAt: string;
  moderatedAt: string | null;
  moderatedBy: string | null;
  rejectionReason: string | null;
  moderationHistory: Array<{
    id: string;
    stage: string;
    detail: string | null;
    status: string;
    createdAt: string;
  }>;
};

export function ModerationDetailPanel({
  selected,
  detailOpen,
  detail,
  detailLoading
}: {
  selected: QueueCandidate | null;
  detailOpen: boolean;
  detail: CandidateDetail | null;
  detailLoading: boolean;
}) {
  if (!selected) {
    return <EmptyState title="No item selected" description="Select a candidate to inspect context before deciding." />;
  }

  if (!detailOpen) {
    return <EmptyState title="Detail closed" description="Press Enter to open details. Press Esc to close." />;
  }

  return (
    <div className="stack moderation-detail-grid">
      {detailLoading ? <p className="muted">Loading candidate detail…</p> : null}
      <div>
        <p className="muted">Candidate ID</p>
        <p>{selected.id}</p>
      </div>
      <div>
        <p className="muted">Import batch ID</p>
        <p>{selected.importBatchId ?? '—'}</p>
      </div>
      <div>
        <p className="muted">Source URL</p>
        {selected.sourceUrl ? (
          <a className="inline-link" href={selected.sourceUrl} target="_blank" rel="noreferrer">
            {selected.sourceUrl}
          </a>
        ) : (
          <p>—</p>
        )}
      </div>
      <div>
        <p className="muted">Config version</p>
        <p>{detail?.configVersion ? `v${detail.configVersion}` : '—'}</p>
      </div>
      <div>
        <p className="muted">Timestamps</p>
        <p>Created: {new Date(detail?.createdAt ?? selected.createdAt).toLocaleString()}</p>
        <p>Updated: {new Date(detail?.updatedAt ?? selected.createdAt).toLocaleString()}</p>
        <p>Moderated: {detail?.moderatedAt ? new Date(detail.moderatedAt).toLocaleString() : 'Not yet'}</p>
      </div>
      <div>
        <p className="muted">Confidence explanation</p>
        <p>{detail?.confidenceReasons ? JSON.stringify(detail.confidenceReasons) : 'No confidence rationale attached.'}</p>
      </div>
      <div>
        <p className="muted">Moderation history</p>
        {detail?.moderationHistory?.length ? (
          <ul className="timeline">
            {detail.moderationHistory.map((entry) => (
              <li key={entry.id}>
                <p>
                  <strong>{entry.stage}</strong> · <StatusBadge tone={entry.status === 'success' ? 'success' : 'danger'}>{entry.status}</StatusBadge>
                </p>
                <p className="muted">{entry.detail ?? 'No detail'}</p>
                <p className="kpi-note">{new Date(entry.createdAt).toLocaleString()}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p>No moderation telemetry entries yet.</p>
        )}
      </div>
      <div>
        <p className="muted">Rejection details</p>
        <p>Reason: {detail?.rejectionReason ?? '—'}</p>
        <p>Moderator: {detail?.moderatedBy ?? '—'}</p>
      </div>
      <div>
        <Link
          className="inline-link"
          href={`/investigations?candidateId=${encodeURIComponent(selected.id)}&importBatchId=${encodeURIComponent(
            selected.importBatchId ?? ''
          )}&sourceUrl=${encodeURIComponent(selected.sourceUrl ?? '')}`}
        >
          Open in Investigations
        </Link>
      </div>
      <p className="muted">Keyboard: j/k move · Enter open · Esc close · a approve · r reject · / search</p>
    </div>
  );
}
