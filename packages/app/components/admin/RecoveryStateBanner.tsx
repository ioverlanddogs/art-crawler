import { AlertBanner } from './AlertBanner';
import { RecoveryStateBadge, recoveryStateLabel, type RecoveryState } from './RecoveryStateBadge';

export function RecoveryStateBanner({
  state,
  inferred,
  context,
  telemetryGap
}: {
  state: RecoveryState;
  inferred?: boolean;
  context: string;
  telemetryGap?: string;
}) {
  const tone = state === 'recovered' ? 'success' : state === 'unknown' ? 'warning' : state === 'degraded' || state === 'blocked' ? 'danger' : 'info';

  return (
    <AlertBanner tone={tone} title="Recovery status overview">
      <p>
        Current state: <RecoveryStateBadge state={state} /> <strong>{recoveryStateLabel(state)}</strong>
        {inferred ? ' (inferred from partial telemetry).' : '.'}
      </p>
      <p className="muted">{context}</p>
      {telemetryGap ? <p className="kpi-note">Telemetry note: {telemetryGap}</p> : null}
    </AlertBanner>
  );
}
