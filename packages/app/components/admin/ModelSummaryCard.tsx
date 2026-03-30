import { GovernanceStateBadge, type GovernanceState } from './GovernanceStateBadge';

type ModelSummary = {
  label: string;
  name: string;
  version: string;
  promotedAt?: string | null;
  promotedBy?: string | null;
  status: GovernanceState;
  shadowMetrics?: unknown;
};

function formatMetrics(metrics: unknown) {
  if (!metrics || typeof metrics !== 'object') {
    return 'No offline metrics are available for this model version.';
  }
  const entries = Object.entries(metrics as Record<string, unknown>).slice(0, 3);
  if (!entries.length) return 'No offline metrics are available for this model version.';
  return entries
    .map(([key, value]) => `${key}: ${typeof value === 'number' ? value.toFixed(3) : String(value)}`)
    .join(' · ');
}

export function ModelSummaryCard({ summary }: { summary: ModelSummary }) {
  return (
    <article className="model-summary-card" aria-label={`${summary.label} model summary`}>
      <div className="model-summary-card-header">
        <h3>{summary.label}</h3>
        <GovernanceStateBadge state={summary.status} />
      </div>
      <p>
        <strong>{summary.name || 'Unknown model'}</strong> · v{summary.version || '—'}
      </p>
      <p className="muted">{summary.promotedAt ? `Promoted ${new Date(summary.promotedAt).toLocaleString()} by ${summary.promotedBy || 'unknown actor'}` : 'Not promoted yet.'}</p>
      <p className="muted">Offline metrics: {formatMetrics(summary.shadowMetrics)}</p>
    </article>
  );
}
