import { StatusBadge } from './StatusBadge';

export type GovernanceState = 'pending' | 'active' | 'failed' | 'rolled_back' | 'superseded' | 'incomplete_context' | 'unknown';

const labelByState: Record<GovernanceState, string> = {
  pending: 'Pending',
  active: 'Active',
  failed: 'Failed',
  rolled_back: 'Rolled back',
  superseded: 'Superseded',
  incomplete_context: 'Incomplete context',
  unknown: 'Unknown'
};

const toneByState: Record<GovernanceState, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  pending: 'warning',
  active: 'success',
  failed: 'danger',
  rolled_back: 'info',
  superseded: 'neutral',
  incomplete_context: 'warning',
  unknown: 'neutral'
};

export function GovernanceStateBadge({ state }: { state: GovernanceState }) {
  return <StatusBadge tone={toneByState[state]}>{labelByState[state]}</StatusBadge>;
}
