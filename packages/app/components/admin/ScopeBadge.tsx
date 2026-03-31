import type { AdminScope } from '@/lib/admin/scope';
import { StatusBadge } from './StatusBadge';

const LABELS: Record<AdminScope, string> = {
  global: 'GLOBAL SCOPE',
  team: 'TEAM SCOPE',
  workspace: 'WORKSPACE SCOPE',
  'source-group': 'SOURCE-GROUP SCOPE',
  'reviewer-owned': 'REVIEWER-OWNED SCOPE'
};

export function ScopeBadge({ scope }: { scope: AdminScope | 'tenant' }) {
  const normalizedScope = scope === 'tenant' ? 'workspace' : scope;
  const tone = normalizedScope === 'global' ? 'info' : normalizedScope === 'team' ? 'warning' : normalizedScope === 'reviewer-owned' ? 'success' : 'neutral';
  return <StatusBadge tone={tone}>{LABELS[normalizedScope]}</StatusBadge>;
}
