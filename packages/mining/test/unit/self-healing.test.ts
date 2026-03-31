import { describe, expect, test } from 'vitest';
import {
  buildFallbackChainPlan,
  buildFalseQuarantineReversal,
  evaluateQuarantineBreach,
  evaluateReleaseReadiness
} from '../../src/lib/self-healing.js';

describe('self-healing quarantine thresholds', () => {
  test('triggers quarantine decision when parser failures spike', () => {
    const decision = evaluateQuarantineBreach({
      parserFailureSpike: 3,
      duplicateSpike: 0,
      falsePositiveSpike: 0,
      oversizedPayloadSpike: 0,
      rollbackSpike: 0,
      confidenceCollapse: 0,
      unhealthySkipRate: 0,
      retryHotspotCount: 0,
      failureCount: 1
    });

    expect(decision.shouldQuarantine).toBe(true);
    expect(decision.severity).toBe('medium');
    expect(decision.reasons[0]?.type).toBe('parser_failure_spike');
    expect(decision.recommendedActions).toContain('quarantine_source');
    expect(decision.recommendedActions).toContain('route_to_investigation');
  });
});

describe('fallback orchestration', () => {
  test('returns parser/extraction fallback chain for extraction failures', () => {
    expect(buildFallbackChainPlan('extraction_missing_title_or_name')).toEqual({
      reason: 'extraction_missing_title_or_name',
      chain: ['parser_fallback', 'extraction_strategy_fallback', 'retry_policy_fallback', 'lightweight_probe'],
      routeToInvestigation: false
    });
  });

  test('returns truncation fallback for oversized payloads', () => {
    expect(buildFallbackChainPlan('response_too_large').chain).toEqual([
      'html_truncation_fetch_fallback',
      'parser_fallback',
      'retry_policy_fallback'
    ]);
  });
});

describe('recovery and reversal checks', () => {
  test('marks source eligible for release when reliability stabilizes', () => {
    expect(
      evaluateReleaseReadiness({
        parserFailureSpike: 0,
        duplicateSpike: 0,
        falsePositiveSpike: 0,
        oversizedPayloadSpike: 0,
        rollbackSpike: 0,
        confidenceCollapse: 0,
        unhealthySkipRate: 0,
        retryHotspotCount: 0,
        failureCount: 1
      })
    ).toEqual({
      eligible: true,
      reasons: [],
      confidenceRecovered: true
    });
  });

  test('holds release when failures are still high', () => {
    const readiness = evaluateReleaseReadiness({
      parserFailureSpike: 0,
      duplicateSpike: 0,
      falsePositiveSpike: 0,
      oversizedPayloadSpike: 0,
      rollbackSpike: 0,
      confidenceCollapse: 0,
      unhealthySkipRate: 0,
      retryHotspotCount: 1,
      failureCount: 4
    });

    expect(readiness.eligible).toBe(false);
    expect(readiness.reasons).toContain('failure_count_above_release_threshold');
    expect(readiness.reasons).toContain('retry_hotspots_not_recovered');
  });

  test('supports deterministic false-quarantine reversal', () => {
    const reversal = buildFalseQuarantineReversal({
      confidenceRecovered: true,
      hasManualOverride: true,
      quarantineTriggeredBySingleSignal: false,
      actor: 'ops-user'
    });

    expect(reversal.shouldReverse).toBe(true);
    expect(reversal.action).toBe('manual_override');
    expect(reversal.reason).toBe('manual_override:ops-user');
  });
});
