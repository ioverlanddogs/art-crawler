export type AssignmentSlaState = 'unassigned' | 'assigned' | 'in_progress' | 'overdue' | 'escalated';

export type AssignmentSnapshot = {
  assignedReviewerId?: string | null;
  dueAt?: Date | null;
  escalationLevel?: number | null;
  slaState?: AssignmentSlaState | null;
};

export function calculateSlaState(snapshot: AssignmentSnapshot, now = new Date()): AssignmentSlaState {
  if ((snapshot.escalationLevel ?? 0) > 0) return 'escalated';
  if (!snapshot.assignedReviewerId) return 'unassigned';
  if (snapshot.dueAt && snapshot.dueAt.getTime() < now.getTime()) return 'overdue';
  if (snapshot.slaState === 'in_progress') return 'in_progress';
  return 'assigned';
}

export function defaultDueAt(hoursFromNow = 24, now = new Date()): Date {
  return new Date(now.getTime() + hoursFromNow * 60 * 60 * 1000);
}

export function snoozeDueAt(currentDueAt: Date | null | undefined, hours = 4, now = new Date()): Date {
  const base = currentDueAt && currentDueAt.getTime() > now.getTime() ? currentDueAt : now;
  return new Date(base.getTime() + hours * 60 * 60 * 1000);
}
