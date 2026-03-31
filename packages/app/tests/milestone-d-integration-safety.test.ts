import { describe, expect, test } from 'vitest';
import { buildDryRunComparison, enforceReplaySafety } from '@/lib/admin/recovery-replay';
import { recommendationNeverAutoPublishes, recommendDuplicateOutcome, recommendSourceHealthActions } from '@/lib/admin/triage-recommendations';

describe('Milestone D cross-cutting safeguards', () => {
  test('replay diff keeps blocker semantics explicit for rollback-event replay targets', () => {
    const safety = enforceReplaySafety({
      action: 'replay_publish_readiness_checks',
      targetType: 'rollback_event',
      dryRun: true
    });
    const comparison = buildDryRunComparison({
      before: {
        confidenceScore: 62,
        duplicateRisk: 70,
        publishReadiness: 40,
        parserVersion: 'p-old',
        modelVersion: 'm-old',
        sourceHealth: 'degraded'
      },
      simulatedAfter: {
        confidenceScore: 70,
        duplicateRisk: 54,
        publishReadiness: 58,
        parserVersion: 'p-new',
        modelVersion: 'm-new',
        sourceHealth: 'healthy'
      }
    });

    expect(safety.allowCanonicalWrite).toBe(false);
    expect(safety.safeguards.join(' ')).toContain('Operator confirmation is required');
    expect(comparison.publishReadinessDelta).toBe(18);
    expect(comparison.duplicateRiskDelta).toBe(-16);
  });

  test('duplicate replay + recommendation remains human-gated until blockers are resolved', () => {
    const safety = enforceReplaySafety({
      action: 'replay_duplicate_compare',
      targetType: 'duplicate_candidate',
      dryRun: false,
      operatorConfirmation: true
    });
    const duplicateRecommendation = recommendDuplicateOutcome({
      matchConfidence: 0.88,
      corroborationSourceCount: 4,
      corroborationConfidence: 0.9,
      conflictingSourceCount: 2,
      unresolvedBlockerCount: 1,
      hasCanonicalTarget: true
    });

    expect(safety.allowCanonicalWrite).toBe(false);
    expect(duplicateRecommendation.recommendation.action).toBe('separate_record');
    expect(recommendationNeverAutoPublishes([duplicateRecommendation.recommendation])).toBe(true);
  });

  test('pipeline recommendation alignment for quarantined sources is assistive-only', () => {
    const actions = recommendSourceHealthActions({
      failureRate: 0.52,
      retryCount: 9,
      parserMismatchSpike: true,
      unhealthySkips: 13,
      queueDepth: 51
    });

    expect(actions.map((item) => item.action)).toEqual(
      expect.arrayContaining(['quarantine_source', 'deprioritize_source', 'parser_fallback'])
    );
    expect(recommendationNeverAutoPublishes(actions)).toBe(true);
  });
});
