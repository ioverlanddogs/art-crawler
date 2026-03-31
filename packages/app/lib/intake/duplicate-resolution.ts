import type { DuplicateResolutionStatus } from '@/lib/prisma-client';

export type DuplicateCandidateLike = {
  id: string;
  resolutionStatus: DuplicateResolutionStatus;
  unresolvedBlockerCount: number;
  conflictingSourceCount: number;
  corroborationSourceCount: number;
  corroborationConfidence: number;
};

export interface DuplicateBlockerSummary {
  hasUnresolvedDuplicates: boolean;
  hasCorroborationConflicts: boolean;
  blockers: string[];
}

export function summarizeDuplicateBlockers(candidates: DuplicateCandidateLike[]): DuplicateBlockerSummary {
  const unresolved = candidates.filter((candidate) => candidate.resolutionStatus === 'unresolved');
  const unresolvedConflictCount = unresolved.filter(
    (candidate) => candidate.unresolvedBlockerCount > 0 || candidate.conflictingSourceCount > 0
  ).length;
  const unresolvedUncorroborated = unresolved.filter((candidate) => candidate.corroborationSourceCount < 1).length;

  const blockers: string[] = [];
  if (unresolved.length > 0) {
    blockers.push(`${unresolved.length} unresolved duplicate candidate(s) require an explicit resolution.`);
  }
  if (unresolvedConflictCount > 0) {
    blockers.push(`${unresolvedConflictCount} duplicate candidate(s) have unresolved corroboration conflicts.`);
  }
  if (unresolvedUncorroborated > 0) {
    blockers.push(`${unresolvedUncorroborated} duplicate candidate(s) have no corroborating source evidence.`);
  }

  return {
    hasUnresolvedDuplicates: unresolved.length > 0,
    hasCorroborationConflicts: unresolvedConflictCount > 0 || unresolvedUncorroborated > 0,
    blockers
  };
}

export function mapResolutionToAuditEvent(status: DuplicateResolutionStatus): string {
  if (status === 'resolved_merge') return 'duplicate_resolved_merge';
  if (status === 'resolved_separate') return 'duplicate_resolved_separate';
  if (status === 'false_positive') return 'duplicate_false_positive';
  if (status === 'escalated') return 'corroboration_conflict';
  return 'duplicate_detected';
}
