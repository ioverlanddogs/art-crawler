import { SlaBadge, type SlaState } from './SlaBadge';

export function SlaTimerCard({
  label,
  ageMinutes,
  targetMinutes,
  inferred = false
}: {
  label: string;
  ageMinutes: number | null;
  targetMinutes: number;
  inferred?: boolean;
}) {
  const state: SlaState =
    ageMinutes === null ? 'unknown' : ageMinutes > targetMinutes ? 'breached' : ageMinutes > targetMinutes * 0.75 ? 'at_risk' : 'healthy';

  return (
    <article className="stat-card">
      <div className="metric-card-header">
        <p className="stat-label">{label}</p>
        <SlaBadge state={state} inferred={inferred} />
      </div>
      <p className="stat-value">{ageMinutes === null ? 'Unknown' : `${ageMinutes}m`}</p>
      <p className="stat-detail">Target: {targetMinutes}m resolution window</p>
    </article>
  );
}
