'use client';

import { ActionButton, EmptyState, StatusBadge } from '@/components/admin';

export type QueueCandidate = {
  id: string;
  title: string;
  sourceUrl: string | null;
  source: string;
  confidenceScore: number;
  confidenceBand: 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'DUPLICATE';
  importBatchId: string | null;
  createdAt: string;
};

export function ModerationQueueTable({
  rows,
  selectedId,
  submittingId,
  busyAction,
  hasAnyItems,
  queueError,
  onSelect,
  onApprove,
  onReject
}: {
  rows: QueueCandidate[];
  selectedId: string | null;
  submittingId: string | null;
  busyAction: 'approve' | 'reject' | null;
  hasAnyItems: boolean;
  queueError: string | null;
  onSelect: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  if (queueError) {
    return <EmptyState title="Queue degraded" description={queueError} />;
  }

  if (!hasAnyItems) {
    return (
      <EmptyState
        title="Queue is empty"
        description="No imported candidates are currently waiting for review."
      />
    );
  }

  if (!rows.length) {
    return (
      <EmptyState
        title="No matching candidates"
        description="Adjust search or filters to restore queue results."
      />
    );
  }

  return (
    <div className="table-wrap">
      <table className="data-table moderation-table">
        <thead>
          <tr>
            <th>Candidate</th>
            <th>Platform</th>
            <th>Confidence</th>
            <th>Status</th>
            <th>Received</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const selected = row.id === selectedId;
            return (
              <tr key={row.id} className={selected ? 'moderation-row-selected' : ''}>
                <td>
                  <button
                    type="button"
                    className={`moderation-select-button ${selected ? 'row-selected' : ''}`}
                    onClick={() => onSelect(row.id)}
                    aria-current={selected ? 'true' : undefined}
                  >
                    <strong>{row.title}</strong>
                    <span className="muted">#{index + 1}</span>
                  </button>
                </td>
                <td>{row.source}</td>
                <td>
                  {Math.round(row.confidenceScore)}% <span className="muted">({row.confidenceBand})</span>
                </td>
                <td>
                  <StatusBadge tone={row.status === 'APPROVED' ? 'success' : row.status === 'REJECTED' ? 'danger' : 'warning'}>
                    {row.status}
                  </StatusBadge>
                </td>
                <td>{new Date(row.createdAt).toLocaleString()}</td>
                <td>
                  <div className="filters-row">
                    <ActionButton
                      disabled={submittingId !== null || row.status !== 'PENDING'}
                      submitting={submittingId === row.id && busyAction === 'approve'}
                      onClick={() => onApprove(row.id)}
                    >
                      Approve
                    </ActionButton>
                    <ActionButton
                      variant="danger"
                      disabled={submittingId !== null || row.status !== 'PENDING'}
                      submitting={submittingId === row.id && busyAction === 'reject'}
                      onClick={() => onReject(row.id)}
                    >
                      Reject
                    </ActionButton>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
