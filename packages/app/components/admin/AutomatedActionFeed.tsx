import { EmptyState } from './EmptyState';

export type AutomatedActionFeedItem = {
  id: string;
  at: string;
  action: string;
  outcome: string;
  origin: 'automation' | 'human' | 'unknown';
  scope: string;
  reason: string;
};

export function AutomatedActionFeed({ rows }: { rows: AutomatedActionFeedItem[] }) {
  if (!rows.length) {
    return (
      <EmptyState
        title="No recent automated actions"
        description="No automation-labeled events were found in available telemetry for this window."
      />
    );
  }

  return (
    <ul className="timeline" aria-label="Recent automated actions">
      {rows.map((row) => (
        <li key={row.id}>
          <p>
            <strong>{row.action}</strong> · {new Date(row.at).toLocaleString()}
          </p>
          <p className="muted">
            Origin: {row.origin} · Outcome: {row.outcome}
          </p>
          <p className="muted">Scope: {row.scope}</p>
          <p className="kpi-note">Reason: {row.reason}</p>
        </li>
      ))}
    </ul>
  );
}
