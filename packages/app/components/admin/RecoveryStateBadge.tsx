import { StatusBadge } from './StatusBadge';

export type RecoveryState =
  | 'paused'
  | 'replaying'
  | 'draining'
  | 'partially_recovered'
  | 'recovered'
  | 'degraded'
  | 'blocked'
  | 'unknown';

const toneByState: Record<RecoveryState, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  paused: 'warning',
  replaying: 'info',
  draining: 'warning',
  partially_recovered: 'warning',
  recovered: 'success',
  degraded: 'danger',
  blocked: 'danger',
  unknown: 'neutral'
};

const labelByState: Record<RecoveryState, string> = {
  paused: 'Paused',
  replaying: 'Replaying',
  draining: 'Draining',
  partially_recovered: 'Partially recovered',
  recovered: 'Recovered',
  degraded: 'Degraded',
  blocked: 'Blocked / unsafe',
  unknown: 'Unknown state'
};

export function RecoveryStateBadge({ state }: { state: RecoveryState }) {
  return <StatusBadge tone={toneByState[state]}>{labelByState[state]}</StatusBadge>;
}

export function recoveryStateLabel(state: RecoveryState) {
  return labelByState[state];
}
