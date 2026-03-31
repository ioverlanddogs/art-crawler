import { describe, expect, test } from 'vitest';
import { planAutonomousRollout } from '@/lib/admin/autonomous-rollout';

describe('Milestone F3 controlled autonomous rollout', () => {
  test('halts rollout when circuit breakers detect drift and blockers', () => {
    const result = planAutonomousRollout(
      [
        { id: 'c1', workspaceId: 'w1', publishRiskScore: 12, unresolvedBlockers: 0 },
        { id: 'c2', workspaceId: 'w1', publishRiskScore: 20, unresolvedBlockers: 1 }
      ],
      {
        blockerDriftRate: 0.2,
        rollbackRate: 0.02,
        canaryFailureRate: 0.01,
        unresolvedDuplicateBlockers: 1
      }
    );

    expect(result.haltRollout).toBe(true);
    expect(result.canaryPlans.every((plan) => plan.mode === 'hold')).toBe(true);
    expect(result.advisoryOnly).toBe(true);
  });

  test('keeps canary output simulation-only even when healthy', () => {
    const result = planAutonomousRollout(
      [{ id: 'c3', workspaceId: 'w2', publishRiskScore: 4, unresolvedBlockers: 0 }],
      {
        blockerDriftRate: 0,
        rollbackRate: 0,
        canaryFailureRate: 0,
        unresolvedDuplicateBlockers: 0
      }
    );

    expect(result.haltRollout).toBe(false);
    expect(result.canaryPlans[0]?.mode).toBe('simulate');
    expect(result.canaryPlans[0]?.requiresHumanConfirmation).toBe(true);
  });
});
