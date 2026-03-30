import { StatusBadge } from './StatusBadge';

export type SlaState = 'healthy' | 'at_risk' | 'breached' | 'unknown';

export function SlaBadge({ state, inferred = false }: { state: SlaState; inferred?: boolean }) {
  const tone = state === 'healthy' ? 'success' : state === 'at_risk' ? 'warning' : state === 'breached' ? 'danger' : 'neutral';
  const label = state === 'at_risk' ? 'SLA AT RISK' : state === 'breached' ? 'SLA BREACHED' : state === 'healthy' ? 'SLA HEALTHY' : 'SLA UNKNOWN';
  return <StatusBadge tone={tone}>{inferred ? `${label} (INFERRED)` : label}</StatusBadge>;
}
