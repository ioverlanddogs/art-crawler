import { EmptyState } from './EmptyState';
import { RecoveryStateBadge } from './RecoveryStateBadge';
import { SectionCard } from './SectionCard';

export type ReplayCandidate = {
  id: string;
  label: string;
  failureReason: string;
  stage: string;
  createdAt: string;
  scope: 'candidate' | 'batch' | 'stage' | 'system';
  blockedReason?: string | null;
};

export function ReplayEligibilityList({ rows }: { rows: ReplayCandidate[] }) {
  return (
    <SectionCard title="Replay-eligible failures" subtitle="Candidates that may be replayed safely, plus blocked reasons when replay is unsafe.">
      {rows.length === 0 ? (
        <EmptyState title="No replay candidates" description="No recent replay-eligible failures were detected in the current window." />
      ) : (
        <ul className="timeline" aria-label="Replay eligibility list">
          {rows.map((row) => (
            <li key={row.id}>
              <p>
                <strong>{row.label}</strong> · <span className="muted">{row.stage}</span>
              </p>
              <p className="muted">{row.failureReason}</p>
              <p className="kpi-note">
                Scope: {row.scope} · {new Date(row.createdAt).toLocaleString()} ·{' '}
                {row.blockedReason ? <RecoveryStateBadge state="blocked" /> : <RecoveryStateBadge state="replaying" />}
              </p>
              {row.blockedReason ? <p className="dialog-error">Blocked: {row.blockedReason}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
