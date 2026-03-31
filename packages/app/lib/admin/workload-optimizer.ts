import { rankReviewerBalance, type ReviewerCapacity } from '@/lib/admin/reviewer-balance';

export interface WorkloadItem {
  id: string;
  queueType: 'review' | 'duplicate' | 'publish';
  sourceRisk: number;
  hotspotScore: number;
  workspaceId: string;
  requiredExpertise?: string[];
}

export interface WorkloadRoutingDecision {
  id: string;
  reviewerId: string | null;
  route: 'direct' | 'hotspot' | 'escalate';
  reason: string;
  requiresHumanDecision: true;
}

export function optimizeWorkload(items: WorkloadItem[], reviewers: ReviewerCapacity[]): WorkloadRoutingDecision[] {
  const balance = rankReviewerBalance(reviewers);

  return items
    .map((item) => {
      if (item.hotspotScore >= 0.75) {
        return {
          id: item.id,
          reviewerId: null,
          route: 'hotspot' as const,
          reason: 'Hotspot route requires duplicate specialist review before assignment.',
          requiresHumanDecision: true as const
        };
      }

      const compatible = reviewers
        .filter((reviewer) => (item.requiredExpertise?.length ? item.requiredExpertise.some((topic) => reviewer.expertise.includes(topic)) : true))
        .map((reviewer) => ({ reviewer, decision: balance.find((row) => row.reviewerId === reviewer.reviewerId)! }))
        .filter((row) => !row.decision.overCeiling)
        .sort((a, b) => (a.decision.balanceScore === b.decision.balanceScore ? a.reviewer.reviewerId.localeCompare(b.reviewer.reviewerId) : a.decision.balanceScore - b.decision.balanceScore));

      const chosen = compatible[0]?.reviewer;
      if (!chosen || item.sourceRisk >= 0.85) {
        return {
          id: item.id,
          reviewerId: chosen?.reviewerId ?? null,
          route: 'escalate' as const,
          reason: 'Risk or capacity pressure requires escalation path; no auto-resolution is executed.',
          requiresHumanDecision: true as const
        };
      }

      return {
        id: item.id,
        reviewerId: chosen.reviewerId,
        route: 'direct' as const,
        reason: 'Balanced assignment recommendation generated within reviewer load ceiling.',
        requiresHumanDecision: true as const
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}
