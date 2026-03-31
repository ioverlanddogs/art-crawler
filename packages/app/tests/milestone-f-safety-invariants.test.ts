import { describe, expect, test } from 'vitest';
import { evaluateGovernancePolicies } from '@/lib/admin/governance-policy';
import { enforceReplaySafety } from '@/lib/admin/recovery-replay';

describe('Milestone F safety invariants', () => {
  test('governance remains blocker-first and cannot enable auto-publish', () => {
    const result = evaluateGovernancePolicies({
      scope: { scope: 'workspace' },
      unresolvedPublishBlockers: 2,
      sourceFailureRate: 0.2,
      staleEvidenceHours: 3,
      rollbackRate: 0,
      overdueSlaHours: 0,
      duplicateSeverity: 'critical'
    });

    expect(result.allowAutoPublish).toBe(false);
    expect(result.allowAutoCanonicalMerge).toBe(false);
    expect(result.firedPolicies.some((policy) => policy.blockedActions.includes('bypass_duplicate_blockers'))).toBe(true);
  });

  test('replay remains non-destructive and confirmation-gated', () => {
    const dryRun = enforceReplaySafety({ action: 'replay_from_stage', targetType: 'ingestion_job', dryRun: true });
    const mutating = enforceReplaySafety({ action: 'replay_from_stage', targetType: 'ingestion_job', dryRun: false, operatorConfirmation: false });

    expect(dryRun.allowCanonicalWrite).toBe(false);
    expect(mutating.allowCanonicalWrite).toBe(false);
    expect(mutating.requiresOperatorConfirmation).toBe(true);
    expect(mutating.confirmed).toBe(false);
  });
});
