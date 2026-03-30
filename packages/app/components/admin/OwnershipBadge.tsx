import { StatusBadge } from './StatusBadge';

export function OwnershipBadge({ owner, escalation = false }: { owner: string | null; escalation?: boolean }) {
  if (!owner) return <StatusBadge tone="neutral">UNASSIGNED</StatusBadge>;
  return <StatusBadge tone={escalation ? 'warning' : 'info'}>{escalation ? `ESCALATED · ${owner}` : owner}</StatusBadge>;
}
