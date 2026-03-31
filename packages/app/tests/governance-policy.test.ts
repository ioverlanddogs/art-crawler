import { describe, expect, test } from 'vitest';
import { evaluateGovernancePolicies } from '@/lib/admin/governance-policy';

describe('governance policy automation', () => {
  test('evaluates publish and quarantine policy thresholds', () => {
    const result = evaluateGovernancePolicies({
      scope: { scope: 'workspace' },
      unresolvedPublishBlockers: 2,
      sourceFailureRate: 0.5,
      staleEvidenceHours: 80,
      rollbackRate: 0.4,
      overdueSlaHours: 30,
      duplicateSeverity: 'high'
    });

    expect(result.firedPolicies.some((policy) => policy.policyId === 'publish_gate_blocker_enforcement')).toBe(true);
    expect(result.firedPolicies.some((policy) => policy.policyId === 'source_quarantine_threshold')).toBe(true);
    expect(result.firedPolicies.some((policy) => policy.policyId === 'stale_evidence_guard')).toBe(true);
    expect(result.allowAutoPublish).toBe(false);
    expect(result.allowAutoCanonicalMerge).toBe(false);
  });

  test('applies scope-aware SLA overrides and preserves audit-safe boundaries', () => {
    const result = evaluateGovernancePolicies({
      scope: { scope: 'reviewer-owned', reviewerId: 'rev-1' },
      unresolvedPublishBlockers: 0,
      sourceFailureRate: 0.2,
      staleEvidenceHours: 10,
      rollbackRate: 0,
      overdueSlaHours: 13,
      duplicateSeverity: 'low',
      overrideByAdmin: true
    });

    const sla = result.firedPolicies.find((policy) => policy.policyId === 'sla_auto_escalation');
    expect(sla).toBeDefined();
    expect(sla?.overrideApplied).toBe(true);
    expect(sla?.blockedActions).toContain('auto_publish');
    expect(result.auditNote).toContain('deterministic');
  });
});
