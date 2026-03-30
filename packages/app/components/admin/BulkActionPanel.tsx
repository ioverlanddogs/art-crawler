import { ActionButton } from './ActionButton';
import { AlertBanner } from './AlertBanner';
import { ScopePreviewTable, type ScopePreviewRow } from './ScopePreviewTable';

export function BulkActionPanel({
  selectedCount,
  previewRows,
  blockingReason,
  unsupportedReplay,
  onApprove,
  onReject,
  onReplay
}: {
  selectedCount: number;
  previewRows: ScopePreviewRow[];
  blockingReason: string | null;
  unsupportedReplay: boolean;
  onApprove: () => void;
  onReject: () => void;
  onReplay: () => void;
}) {
  return (
    <div className="stack" role="region" aria-label="Bulk workflow controls">
      <p className="muted">
        Selected scope: <strong>{selectedCount}</strong> candidate{selectedCount === 1 ? '' : 's'}.
      </p>
      {blockingReason ? (
        <AlertBanner tone="warning" title="Bulk action blocked">
          {blockingReason}
        </AlertBanner>
      ) : null}
      <ScopePreviewTable rows={previewRows.slice(0, 8)} />
      <div className="filters-row">
        <ActionButton disabled={!selectedCount || Boolean(blockingReason)} onClick={onApprove}>
          Bulk approve
        </ActionButton>
        <ActionButton variant="danger" disabled={!selectedCount || Boolean(blockingReason)} onClick={onReject}>
          Bulk reject
        </ActionButton>
        <ActionButton variant="secondary" disabled={unsupportedReplay || !selectedCount} onClick={onReplay}>
          Bulk replay
        </ActionButton>
      </div>
      {unsupportedReplay ? (
        <p className="kpi-note">Replay is currently not supported by admin moderation APIs. Use Recovery in System tools when available.</p>
      ) : null}
    </div>
  );
}
