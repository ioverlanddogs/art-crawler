export interface SourceTrustSnapshot {
  sourceId: string;
  successRate: number;
  corroborationRate: number;
  rollbackLinkedRate: number;
  unresolvedBlockers: number;
}

export interface TrustPromotionDecision {
  sourceId: string;
  recommendation: 'promote_candidate' | 'hold' | 'demote_candidate';
  rationale: string;
  mutatesCanonicalRecords: false;
  requiresHumanDecision: true;
}

export function proposeSourceTrustPromotion(snapshots: SourceTrustSnapshot[]): TrustPromotionDecision[] {
  return snapshots
    .map((snapshot) => {
      if (snapshot.unresolvedBlockers > 0 || snapshot.rollbackLinkedRate >= 0.1) {
        return {
          sourceId: snapshot.sourceId,
          recommendation: 'hold' as const,
          rationale: 'Blockers or rollback drift detected; source trust remains unchanged.',
          mutatesCanonicalRecords: false as const,
          requiresHumanDecision: true as const
        };
      }

      if (snapshot.successRate >= 0.92 && snapshot.corroborationRate >= 0.8) {
        return {
          sourceId: snapshot.sourceId,
          recommendation: 'promote_candidate' as const,
          rationale: 'Consistent high-success source with strong corroboration profile.',
          mutatesCanonicalRecords: false as const,
          requiresHumanDecision: true as const
        };
      }

      if (snapshot.successRate < 0.55 || snapshot.corroborationRate < 0.4) {
        return {
          sourceId: snapshot.sourceId,
          recommendation: 'demote_candidate' as const,
          rationale: 'Reliability below safety band; recommend conservative trust reduction review.',
          mutatesCanonicalRecords: false as const,
          requiresHumanDecision: true as const
        };
      }

      return {
        sourceId: snapshot.sourceId,
        recommendation: 'hold' as const,
        rationale: 'Metrics do not yet justify trust tier changes.',
        mutatesCanonicalRecords: false as const,
        requiresHumanDecision: true as const
      };
    })
    .sort((a, b) => a.sourceId.localeCompare(b.sourceId));
}
