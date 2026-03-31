import { describe, expect, test } from 'vitest';
import { optimizeWorkload } from '@/lib/admin/workload-optimizer';
import { buildEscalationTree } from '@/lib/admin/escalation-tree';

describe('Milestone F2 workload optimization', () => {
  test('balances reviewers under load ceiling and routes hotspots safely', () => {
    const decisions = optimizeWorkload(
      [
        {
          id: 'item-a',
          queueType: 'duplicate',
          sourceRisk: 0.3,
          hotspotScore: 0.8,
          workspaceId: 'w1',
          requiredExpertise: ['duplicate']
        },
        {
          id: 'item-b',
          queueType: 'review',
          sourceRisk: 0.2,
          hotspotScore: 0.1,
          workspaceId: 'w1'
        }
      ],
      [
        { reviewerId: 'r1', expertise: ['duplicate'], openItems: 2, overdueItems: 0, escalationItems: 0, loadCeiling: 12 },
        { reviewerId: 'r2', expertise: ['review'], openItems: 10, overdueItems: 2, escalationItems: 1, loadCeiling: 12 }
      ]
    );

    expect(decisions.find((x) => x.id === 'item-a')?.route).toBe('hotspot');
    expect(decisions.find((x) => x.id === 'item-b')?.reviewerId).toBe('r1');
    expect(decisions.every((x) => x.requiresHumanDecision)).toBe(true);
  });

  test('reuses feedback calibration in deterministic escalation trees', () => {
    const tree = buildEscalationTree([
      {
        itemId: 'x-1',
        riskScore: 0.9,
        blockerCount: 1,
        reviewerOverrideRate: 0.2,
        rollbackPenaltyRate: 0.1,
        duplicatePrecision: 0.8
      }
    ]);

    expect(tree[0]?.level).toBe('L3');
    expect(tree[0]?.routeTo).toBe('governance-council');
    expect(tree[0]?.calibratedConfidence).toBeLessThan(1);
    expect(tree[0]?.requiresHumanDecision).toBe(true);
  });
});
