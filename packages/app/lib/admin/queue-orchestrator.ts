import { scoreDispatchPriority, type QueueType } from '@/lib/admin/dispatch-priority';

export interface QueueItemInput {
  id: string;
  queueType: QueueType;
  scopeKey: string;
  workspaceId?: string | null;
  reviewerId?: string | null;
  ageHours: number;
  slaTargetHours: number;
  escalationLevel: number;
  unresolvedBlockers: number;
  duplicateRisk: number;
  corroborationRisk: number;
}

export interface QueueRoutingResult {
  id: string;
  queueType: QueueType;
  scopeKey: string;
  reviewerId: string | null;
  workspaceId: string | null;
  priorityScore: number;
  dispatchLane: 'expedite' | 'priority' | 'standard' | 'defer';
  blockerOverride: boolean;
  reasonCodes: string[];
}

export interface PublishCohort {
  cohortId: string;
  itemIds: string[];
  readinessBand: 'safe' | 'guarded' | 'blocked';
  requiresHumanRelease: true;
  advisoryOnly: true;
}

export function orchestrateQueue(items: QueueItemInput[]): QueueRoutingResult[] {
  return [...items]
    .map((item) => {
      const scored = scoreDispatchPriority(item);
      return {
        id: item.id,
        queueType: item.queueType,
        scopeKey: item.scopeKey,
        reviewerId: item.reviewerId ?? null,
        workspaceId: item.workspaceId ?? null,
        priorityScore: scored.priorityScore,
        dispatchLane: resolveLane(scored.priorityScore, scored.blockerOverride),
        blockerOverride: scored.blockerOverride,
        reasonCodes: scored.reasonCodes
      } as QueueRoutingResult;
    })
    .sort(sortDeterministically);
}

export function buildPublishCohorts(items: QueueRoutingResult[], cohortSize = 10): PublishCohort[] {
  const ordered = [...items]
    .filter((item) => item.queueType === 'publish')
    .sort(sortDeterministically);

  const cohorts: PublishCohort[] = [];
  for (let index = 0; index < ordered.length; index += cohortSize) {
    const slice = ordered.slice(index, index + cohortSize);
    const blocked = slice.filter((row) => row.blockerOverride).length;
    const average = Math.round(slice.reduce((acc, row) => acc + row.priorityScore, 0) / Math.max(1, slice.length));
    const readinessBand = blocked > 0 ? 'blocked' : average >= 70 ? 'guarded' : 'safe';

    cohorts.push({
      cohortId: `cohort-${Math.floor(index / cohortSize) + 1}`,
      itemIds: slice.map((row) => row.id),
      readinessBand,
      requiresHumanRelease: true,
      advisoryOnly: true
    });
  }

  return cohorts;
}

function resolveLane(score: number, blockerOverride: boolean): QueueRoutingResult['dispatchLane'] {
  if (blockerOverride) return 'expedite';
  if (score >= 80) return 'priority';
  if (score >= 45) return 'standard';
  return 'defer';
}

function sortDeterministically(a: QueueRoutingResult, b: QueueRoutingResult) {
  if (a.scopeKey !== b.scopeKey) return a.scopeKey.localeCompare(b.scopeKey);
  if (a.priorityScore !== b.priorityScore) return b.priorityScore - a.priorityScore;
  return a.id.localeCompare(b.id);
}
