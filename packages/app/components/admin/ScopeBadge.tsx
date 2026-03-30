import { StatusBadge } from './StatusBadge';

export function ScopeBadge({ scope }: { scope: 'tenant' | 'team' | 'global' }) {
  const tone = scope === 'global' ? 'info' : scope === 'team' ? 'warning' : 'neutral';
  return <StatusBadge tone={tone}>{scope.toUpperCase()} SCOPE</StatusBadge>;
}
