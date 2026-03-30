import { StatusBadge } from './StatusBadge';

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export function SeverityBadge({ severity }: { severity: Severity }) {
  const tone = severity === 'critical' ? 'danger' : severity === 'high' ? 'warning' : severity === 'medium' ? 'info' : 'neutral';
  return <StatusBadge tone={tone}>{severity.toUpperCase()}</StatusBadge>;
}
