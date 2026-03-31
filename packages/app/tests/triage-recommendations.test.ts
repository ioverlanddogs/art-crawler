import { describe, expect, test } from 'vitest';
import {
  recommendAssignmentActions,
  recommendDuplicateOutcome,
  recommendReviewActions,
  recommendationNeverAutoPublishes,
  recommendSourceHealthActions
} from '@/lib/admin/triage-recommendations';

describe('triage recommendation logic', () => {
  test('review recommendations include safe-field approvals for low risk records', () => {
    const result = recommendReviewActions({
      unresolvedDuplicateCount: 0,
      lowConfidenceCount: 0,
      unreviewedCount: 1,
      conflictCount: 0,
      staleHours: 4
    });

    expect(result.some((entry) => entry.action === 'approve_safe_fields')).toBe(true);
  });

  test('review recommendations include escalation on duplicate blockers', () => {
    const result = recommendReviewActions({
      unresolvedDuplicateCount: 2,
      lowConfidenceCount: 1,
      unreviewedCount: 0,
      conflictCount: 1,
      staleHours: 72
    });

    expect(result.some((entry) => entry.action === 'escalate')).toBe(true);
  });

  test('no-auto-publish safeguard is always enforced', () => {
    const result = [
      ...recommendReviewActions({
        unresolvedDuplicateCount: 0,
        lowConfidenceCount: 0,
        unreviewedCount: 0,
        conflictCount: 0,
        staleHours: 2
      }),
      ...recommendSourceHealthActions({
        failureRate: 0.2,
        retryCount: 3,
        parserMismatchSpike: false,
        unhealthySkips: 0,
        queueDepth: 10
      })
    ];

    expect(recommendationNeverAutoPublishes(result)).toBe(true);
    expect(result.every((entry) => entry.requiresHumanDecision)).toBe(true);
  });
});

describe('duplicate suggestion confidence', () => {
  test('recommends separate record when corroboration conflicts remain', () => {
    const result = recommendDuplicateOutcome({
      matchConfidence: 0.9,
      corroborationSourceCount: 4,
      corroborationConfidence: 0.7,
      conflictingSourceCount: 2,
      unresolvedBlockerCount: 1,
      hasCanonicalTarget: true
    });

    expect(result.recommendation.action).toBe('separate_record');
    expect(result.corroborationExplanation).toContain('2 conflicting source');
  });

  test('recommends merge_fields_only for high-confidence corroborated duplicate', () => {
    const result = recommendDuplicateOutcome({
      matchConfidence: 0.89,
      corroborationSourceCount: 3,
      corroborationConfidence: 0.92,
      conflictingSourceCount: 0,
      unresolvedBlockerCount: 0,
      hasCanonicalTarget: true
    });

    expect(result.recommendation.action).toBe('merge_fields_only');
    expect(result.confidenceExplanation).toContain('89%');
  });
});

describe('SLA prediction recommendations', () => {
  test('predicts SLA breach and recommends reassignment when current owner is overloaded', () => {
    const result = recommendAssignmentActions(
      [
        { reviewerId: 'reviewer-a', openCount: 18, overdueCount: 9, escalationCount: 4 },
        { reviewerId: 'reviewer-b', openCount: 3, overdueCount: 1, escalationCount: 0 }
      ],
      { currentReviewerId: 'reviewer-a', ageHours: 30, slaTargetHours: 24, escalationLevel: 1 }
    );

    expect(result.slaBreachPrediction.breachProbability).toBeGreaterThanOrEqual(0.8);
    expect(result.recommendReassignment?.reviewerId).toBe('reviewer-b');
  });
});
