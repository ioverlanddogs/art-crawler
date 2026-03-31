import { describe, expect, test } from 'vitest';
import { scheduleReplayWindows } from '../../src/lib/replay-scheduler.js';
import { proposeSourceTrustPromotion } from '../../src/lib/source-trust-promotion.js';

describe('Milestone F mining safety helpers', () => {
  test('schedules replay as non-destructive dry-run by default', () => {
    const schedule = scheduleReplayWindows(
      [{ id: 'r1', sourceUrl: 'https://example.com', scopeKey: 'workspace:w1', preferredWindowStartHourUtc: 3, expectedDurationMinutes: 25 }],
      new Date('2026-03-31T01:00:00.000Z')
    );

    expect(schedule[0]?.dryRun).toBe(true);
    expect(schedule[0]?.mutatesLiveState).toBe(false);
  });

  test('trust promotion stays advisory and blocker-first', () => {
    const decisions = proposeSourceTrustPromotion([
      { sourceId: 'a', successRate: 0.97, corroborationRate: 0.9, rollbackLinkedRate: 0, unresolvedBlockers: 0 },
      { sourceId: 'b', successRate: 0.97, corroborationRate: 0.9, rollbackLinkedRate: 0.2, unresolvedBlockers: 0 }
    ]);

    expect(decisions[0]?.recommendation).toBe('promote_candidate');
    expect(decisions[1]?.recommendation).toBe('hold');
    expect(decisions.every((d: { mutatesCanonicalRecords: boolean; requiresHumanDecision: boolean }) => d.mutatesCanonicalRecords === false && d.requiresHumanDecision)).toBe(true);
  });
});
