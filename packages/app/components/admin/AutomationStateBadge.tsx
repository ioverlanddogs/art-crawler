import { StatusBadge } from './StatusBadge';

export type AutomationState = 'disabled' | 'shadow' | 'active' | 'rate_limited' | 'paused' | 'exception_heavy' | 'unknown';

const STATE_COPY: Record<AutomationState, { label: string; tone: 'neutral' | 'warning' | 'success' | 'danger' | 'info'; description: string }> = {
  disabled: {
    label: 'Disabled',
    tone: 'neutral',
    description: 'Rule is configured but not enforcing any actions.'
  },
  shadow: {
    label: 'Shadow (observe only)',
    tone: 'info',
    description: 'Rule evaluates records and logs outcomes without enforcing.'
  },
  active: {
    label: 'Active (enforcing)',
    tone: 'success',
    description: 'Rule is actively making automation decisions.'
  },
  rate_limited: {
    label: 'Rate-limited',
    tone: 'warning',
    description: 'Rule is enforcing with throttling due to operational limits.'
  },
  paused: {
    label: 'Paused',
    tone: 'warning',
    description: 'Automation is temporarily paused pending operator review.'
  },
  exception_heavy: {
    label: 'Exception-heavy',
    tone: 'danger',
    description: 'Rule is escalating unusually high exception volume.'
  },
  unknown: {
    label: 'Unknown / incomplete telemetry',
    tone: 'warning',
    description: 'Telemetry is partial; treat this rule as non-trustworthy until reviewed.'
  }
};

export function AutomationStateBadge({ state }: { state: AutomationState }) {
  const copy = STATE_COPY[state];
  return (
    <span className="automation-state-wrap">
      <StatusBadge tone={copy.tone}>{copy.label}</StatusBadge>
      <span className="kpi-note">{copy.description}</span>
    </span>
  );
}

export function getAutomationStateCopy(state: AutomationState) {
  return STATE_COPY[state];
}
