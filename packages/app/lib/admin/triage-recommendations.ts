export type RecommendationAction =
  | 'approve_safe_fields'
  | 'request_reparse'
  | 'escalate'
  | 'defer'
  | 'merge_fields_only'
  | 'false_positive'
  | 'separate_record'
  | 'assign_reviewer'
  | 'reassign_reviewer'
  | 'predict_sla_breach'
  | 'suggest_escalation_owner'
  | 'quarantine_source'
  | 'deprioritize_source'
  | 'replay_source'
  | 'parser_fallback';

export interface ActionRecommendation<T extends RecommendationAction = RecommendationAction> {
  action: T;
  confidence: number;
  summary: string;
  rationale: string[];
  requiresHumanDecision: true;
}

export interface ReviewRecommendationInput {
  unresolvedDuplicateCount: number;
  lowConfidenceCount: number;
  unreviewedCount: number;
  conflictCount: number;
  staleHours: number;
}

export function recommendReviewActions(input: ReviewRecommendationInput): ActionRecommendation<
  'approve_safe_fields' | 'request_reparse' | 'escalate' | 'defer'
>[] {
  const recs: ActionRecommendation<'approve_safe_fields' | 'request_reparse' | 'escalate' | 'defer'>[] = [];

  if (input.lowConfidenceCount === 0 && input.unreviewedCount <= 2 && input.conflictCount === 0) {
    recs.push({
      action: 'approve_safe_fields',
      confidence: 0.83,
      summary: 'Recommend safe-field approvals first.',
      rationale: ['Low-confidence field count is zero.', `Only ${input.unreviewedCount} field(s) remain unreviewed.`],
      requiresHumanDecision: true
    });
  }

  if (input.conflictCount > 0 || input.lowConfidenceCount >= 3) {
    recs.push({
      action: 'request_reparse',
      confidence: 0.76,
      summary: 'Recommend reparse due to confidence/conflict instability.',
      rationale: [`Conflicts detected: ${input.conflictCount}.`, `Low-confidence fields: ${input.lowConfidenceCount}.`],
      requiresHumanDecision: true
    });
  }

  if (input.unresolvedDuplicateCount > 0 || input.staleHours > 48) {
    recs.push({
      action: 'escalate',
      confidence: 0.72,
      summary: 'Recommend escalation for duplicate risk or aging SLA.',
      rationale: [
        `Unresolved duplicate candidates: ${input.unresolvedDuplicateCount}.`,
        `Item age: ${Math.round(input.staleHours)}h.`
      ],
      requiresHumanDecision: true
    });
  }

  if (recs.length === 0) {
    recs.push({
      action: 'defer',
      confidence: 0.61,
      summary: 'Recommend defer until stronger corroboration arrives.',
      rationale: ['No high-signal action stands out in current evidence.'],
      requiresHumanDecision: true
    });
  }

  return recs;
}

export interface DuplicateRecommendationInput {
  matchConfidence: number;
  corroborationSourceCount: number;
  corroborationConfidence: number;
  conflictingSourceCount: number;
  unresolvedBlockerCount: number;
  hasCanonicalTarget: boolean;
}

export interface DuplicateRecommendationResult {
  recommendation: ActionRecommendation<'merge_fields_only' | 'false_positive' | 'separate_record'>;
  confidenceExplanation: string;
  corroborationExplanation: string;
}

export function recommendDuplicateOutcome(input: DuplicateRecommendationInput): DuplicateRecommendationResult {
  const confidenceExplanation = `Model confidence ${Math.round(input.matchConfidence * 100)}% with corroboration confidence ${Math.round(input.corroborationConfidence * 100)}%.`;
  const corroborationExplanation = `${input.corroborationSourceCount} corroborating source(s), ${input.conflictingSourceCount} conflicting source(s), ${input.unresolvedBlockerCount} unresolved blocker(s).`;

  if (input.conflictingSourceCount >= 2 || input.unresolvedBlockerCount > 0 || !input.hasCanonicalTarget) {
    return {
      recommendation: {
        action: 'separate_record',
        confidence: 0.78,
        summary: 'Recommend separate record pending conflict resolution.',
        rationale: [
          'High conflict/unresolved blocker profile detected.',
          input.hasCanonicalTarget ? 'Canonical target exists but corroboration is unstable.' : 'No canonical target exists.'
        ],
        requiresHumanDecision: true
      },
      confidenceExplanation,
      corroborationExplanation
    };
  }

  if (input.matchConfidence < 0.35 && input.corroborationSourceCount <= 1) {
    return {
      recommendation: {
        action: 'false_positive',
        confidence: 0.74,
        summary: 'Recommend marking as likely false positive.',
        rationale: ['Duplicate match confidence is weak.', 'Corroboration is sparse.'],
        requiresHumanDecision: true
      },
      confidenceExplanation,
      corroborationExplanation
    };
  }

  return {
    recommendation: {
      action: 'merge_fields_only',
      confidence: 0.81,
      summary: 'Recommend merge using safe-field enrichment only.',
      rationale: ['Strong confidence and corroboration profile.', 'Conflict profile is low.'],
      requiresHumanDecision: true
    },
    confidenceExplanation,
    corroborationExplanation
  };
}

export interface ReviewerLoad {
  reviewerId: string;
  openCount: number;
  overdueCount: number;
  escalationCount: number;
}

export interface AssignmentRecommendationResult {
  recommendBestReviewer: ActionRecommendation<'assign_reviewer'> & { reviewerId: string };
  recommendReassignment: (ActionRecommendation<'reassign_reviewer'> & { reviewerId: string }) | null;
  slaBreachPrediction: ActionRecommendation<'predict_sla_breach'> & { breachProbability: number };
  escalationOwner: (ActionRecommendation<'suggest_escalation_owner'> & { reviewerId: string }) | null;
}

export function recommendAssignmentActions(
  reviewerLoads: ReviewerLoad[],
  target: { currentReviewerId: string | null; ageHours: number; slaTargetHours: number; escalationLevel: number }
): AssignmentRecommendationResult {
  const sortedByCapacity = [...reviewerLoads].sort((a, b) => (a.openCount + a.overdueCount * 2) - (b.openCount + b.overdueCount * 2));
  const best = sortedByCapacity[0];
  const current = reviewerLoads.find((item) => item.reviewerId === target.currentReviewerId) ?? null;
  const breachProbability = Math.max(0, Math.min(1, target.ageHours / Math.max(1, target.slaTargetHours) + (target.escalationLevel > 0 ? 0.15 : 0)));

  const recommendReassignment =
    current && best && best.reviewerId !== current.reviewerId && current.overdueCount > best.overdueCount
      ? {
          action: 'reassign_reviewer' as const,
          reviewerId: best.reviewerId,
          confidence: 0.73,
          summary: `Recommend reassignment to ${best.reviewerId} for SLA recovery.`,
          rationale: [`Current reviewer overdue queue: ${current.overdueCount}.`, `Suggested reviewer overdue queue: ${best.overdueCount}.`],
          requiresHumanDecision: true as const
        }
      : null;

  const escalationCandidate = [...reviewerLoads].sort((a, b) => a.escalationCount - b.escalationCount)[0];

  return {
    recommendBestReviewer: {
      action: 'assign_reviewer',
      reviewerId: best?.reviewerId ?? 'unassigned',
      confidence: best ? 0.77 : 0.51,
      summary: best ? `Recommend assigning to ${best.reviewerId}.` : 'No active reviewer recommendation available.',
      rationale: best ? [`Open queue: ${best.openCount}.`, `Overdue queue: ${best.overdueCount}.`] : ['No reviewer load data available.'],
      requiresHumanDecision: true
    },
    recommendReassignment,
    slaBreachPrediction: {
      action: 'predict_sla_breach',
      breachProbability,
      confidence: 0.75,
      summary: breachProbability >= 0.8 ? 'High SLA breach risk predicted.' : breachProbability >= 0.5 ? 'Moderate SLA breach risk predicted.' : 'Low SLA breach risk predicted.',
      rationale: [`Record age: ${Math.round(target.ageHours)}h.`, `SLA target: ${target.slaTargetHours}h.`, `Escalation level: L${target.escalationLevel}.`],
      requiresHumanDecision: true
    },
    escalationOwner: escalationCandidate
      ? {
          action: 'suggest_escalation_owner',
          reviewerId: escalationCandidate.reviewerId,
          confidence: 0.7,
          summary: `Suggest escalation owner ${escalationCandidate.reviewerId}.`,
          rationale: [`Lowest escalation workload in team (${escalationCandidate.escalationCount}).`],
          requiresHumanDecision: true
        }
      : null
  };
}

export function recommendSourceHealthActions(input: {
  failureRate: number;
  retryCount: number;
  parserMismatchSpike: boolean;
  unhealthySkips: number;
  queueDepth: number;
}): ActionRecommendation<'quarantine_source' | 'deprioritize_source' | 'replay_source' | 'parser_fallback'>[] {
  const recommendations: ActionRecommendation<'quarantine_source' | 'deprioritize_source' | 'replay_source' | 'parser_fallback'>[] = [];

  if (input.failureRate >= 0.4 || input.unhealthySkips > 10) {
    recommendations.push({
      action: 'quarantine_source',
      confidence: 0.82,
      summary: 'Recommend source quarantine to stop ongoing bad ingest.',
      rationale: [`Failure rate: ${Math.round(input.failureRate * 100)}%.`, `Unhealthy skips: ${input.unhealthySkips}.`],
      requiresHumanDecision: true
    });
  }

  if (input.queueDepth > 40 || input.retryCount > 8) {
    recommendations.push({
      action: 'deprioritize_source',
      confidence: 0.76,
      summary: 'Recommend temporary deprioritization to protect queue throughput.',
      rationale: [`Queue depth: ${input.queueDepth}.`, `Retries observed: ${input.retryCount}.`],
      requiresHumanDecision: true
    });
  }

  if (input.failureRate > 0 && input.failureRate < 0.4) {
    recommendations.push({
      action: 'replay_source',
      confidence: 0.68,
      summary: 'Recommend controlled replay once upstream issue is fixed.',
      rationale: ['Failures are present but not severe enough for automatic quarantine.'],
      requiresHumanDecision: true
    });
  }

  if (input.parserMismatchSpike) {
    recommendations.push({
      action: 'parser_fallback',
      confidence: 0.8,
      summary: 'Recommend parser fallback while mismatch spike persists.',
      rationale: ['Parser mismatch spike has been detected in current telemetry window.'],
      requiresHumanDecision: true
    });
  }

  return recommendations;
}

export function recommendationNeverAutoPublishes(recommendations: ActionRecommendation[]): boolean {
  return recommendations.every((recommendation) => recommendation.requiresHumanDecision);
}
