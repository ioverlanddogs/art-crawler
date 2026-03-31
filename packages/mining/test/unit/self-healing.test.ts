import { describe, expect, test } from 'vitest';
import {
  buildFallbackChain,
  evaluateReliabilityBreaches,
  shouldReleaseQuarantine
} from '../../src/lib/self-healing.js';

describe('self-healing quarantine thresholds', () => {
  test('triggers quarantine decision when parser failures spike', () => {
    const decision = evaluateReliabilityBreaches({
      parserFailures: 3,
      duplicateSpikes: 0,
      falsePositiveSpikes: 0,
      oversizedPayloadSpikes: 0,
      rollbackSpikes: 0,
      confidenceCollapseSpikes: 0,
      failureCount: 1
    });

    expect(decision.breached).toBe(true);
    expect(decision.breachType).toBe('parser_failure_spike');
    expect(decision.actions).toContain('quarantine_source');
    expect(decision.actions).toContain('route_to_investigation');
  });
});

describe('fallback orchestration', () => {
  test('returns parser/extraction fallback chain for extraction failures', () => {
    expect(buildFallbackChain('extraction_missing_title_or_name')).toEqual([
      'parser_fallback',
      'extraction_strategy_fallback',
      'retry_policy_fallback'
    ]);
  });

  test('returns truncation fallback for oversized payloads', () => {
    expect(buildFallbackChain('response_too_large')).toEqual([
      'html_truncation_fetch_fallback',
      'parser_fallback'
    ]);
  });
});

describe('recovery and reversal checks', () => {
  test('releases quarantine when reliability stabilizes', () => {
    expect(
      shouldReleaseQuarantine({
        parserFailures: 0,
        duplicateSpikes: 0,
        falsePositiveSpikes: 0,
        oversizedPayloadSpikes: 0,
        rollbackSpikes: 0,
        confidenceCollapseSpikes: 0,
        failureCount: 1
      })
    ).toBe(true);
  });

  test('holds quarantine when failures are still high', () => {
    expect(
      shouldReleaseQuarantine({
        parserFailures: 0,
        duplicateSpikes: 0,
        falsePositiveSpikes: 0,
        oversizedPayloadSpikes: 0,
        rollbackSpikes: 0,
        confidenceCollapseSpikes: 0,
        failureCount: 4
      })
    ).toBe(false);
  });
});
