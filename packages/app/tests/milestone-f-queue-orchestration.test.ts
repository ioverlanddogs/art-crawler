import { describe, expect, test } from 'vitest';
import { orchestrateQueue, buildPublishCohorts } from '@/lib/admin/queue-orchestrator';

describe('Milestone F1 queue orchestration', () => {
  test('assigns deterministic priority metadata with blocker-first ordering', () => {
    const first = orchestrateQueue([
      {
        id: 'a',
        queueType: 'publish',
        scopeKey: 'workspace:1',
        ageHours: 4,
        slaTargetHours: 24,
        escalationLevel: 1,
        unresolvedBlockers: 0,
        duplicateRisk: 0.3,
        corroborationRisk: 0.2
      },
      {
        id: 'b',
        queueType: 'publish',
        scopeKey: 'workspace:1',
        ageHours: 1,
        slaTargetHours: 24,
        escalationLevel: 0,
        unresolvedBlockers: 2,
        duplicateRisk: 0.1,
        corroborationRisk: 0.1
      }
    ]);

    const second = orchestrateQueue([
      {
        id: 'a',
        queueType: 'publish',
        scopeKey: 'workspace:1',
        ageHours: 4,
        slaTargetHours: 24,
        escalationLevel: 1,
        unresolvedBlockers: 0,
        duplicateRisk: 0.3,
        corroborationRisk: 0.2
      },
      {
        id: 'b',
        queueType: 'publish',
        scopeKey: 'workspace:1',
        ageHours: 1,
        slaTargetHours: 24,
        escalationLevel: 0,
        unresolvedBlockers: 2,
        duplicateRisk: 0.1,
        corroborationRisk: 0.1
      }
    ]);

    expect(first).toEqual(second);
    expect(first[0]?.id).toBe('b');
    expect(first[0]?.blockerOverride).toBe(true);
    expect(first[0]?.dispatchLane).toBe('expedite');
  });

  test('builds advisory publish cohorts only', () => {
    const items = orchestrateQueue([
      {
        id: 'p1',
        queueType: 'publish',
        scopeKey: 'workspace:1',
        ageHours: 1,
        slaTargetHours: 24,
        escalationLevel: 0,
        unresolvedBlockers: 0,
        duplicateRisk: 0,
        corroborationRisk: 0
      }
    ]);

    const cohorts = buildPublishCohorts(items, 1);
    expect(cohorts[0]?.requiresHumanRelease).toBe(true);
    expect(cohorts[0]?.advisoryOnly).toBe(true);
  });
});
