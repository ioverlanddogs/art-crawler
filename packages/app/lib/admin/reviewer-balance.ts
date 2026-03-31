export interface ReviewerCapacity {
  reviewerId: string;
  expertise: string[];
  openItems: number;
  overdueItems: number;
  escalationItems: number;
  loadCeiling: number;
}

export interface ReviewerBalanceDecision {
  reviewerId: string;
  balanceScore: number;
  overCeiling: boolean;
}

export function rankReviewerBalance(reviewers: ReviewerCapacity[]): ReviewerBalanceDecision[] {
  return reviewers
    .map((reviewer) => {
      const weighted = reviewer.openItems + reviewer.overdueItems * 1.8 + reviewer.escalationItems * 2.2;
      const utilization = reviewer.loadCeiling <= 0 ? 1 : weighted / reviewer.loadCeiling;
      return {
        reviewerId: reviewer.reviewerId,
        balanceScore: Math.round(utilization * 100),
        overCeiling: utilization > 1
      };
    })
    .sort((a, b) => (a.balanceScore === b.balanceScore ? a.reviewerId.localeCompare(b.reviewerId) : a.balanceScore - b.balanceScore));
}
