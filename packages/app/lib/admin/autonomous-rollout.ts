import { evaluateCircuitBreakers, type CircuitBreakerInput } from '@/lib/admin/circuit-breakers';

export interface RolloutCandidate {
  id: string;
  workspaceId: string;
  publishRiskScore: number;
  unresolvedBlockers: number;
}

export interface CanaryPlan {
  cohortId: string;
  candidateIds: string[];
  mode: 'simulate' | 'hold';
  requiresHumanConfirmation: true;
}

export interface RolloutDecision {
  canaryPlans: CanaryPlan[];
  haltRollout: boolean;
  reasons: string[];
  advisoryOnly: true;
}

export function planAutonomousRollout(candidates: RolloutCandidate[], breakerInput: CircuitBreakerInput): RolloutDecision {
  const breaker = evaluateCircuitBreakers(breakerInput);

  const ordered = [...candidates].sort((a, b) => {
    if (a.workspaceId !== b.workspaceId) return a.workspaceId.localeCompare(b.workspaceId);
    if (a.publishRiskScore !== b.publishRiskScore) return a.publishRiskScore - b.publishRiskScore;
    return a.id.localeCompare(b.id);
  });

  const canaryPlans: CanaryPlan[] = [];
  for (let i = 0; i < ordered.length; i += 5) {
    const slice = ordered.slice(i, i + 5);
    canaryPlans.push({
      cohortId: `canary-${Math.floor(i / 5) + 1}`,
      candidateIds: slice.map((row) => row.id),
      mode: breaker.haltRollout || slice.some((row) => row.unresolvedBlockers > 0) ? 'hold' : 'simulate',
      requiresHumanConfirmation: true
    });
  }

  return {
    canaryPlans,
    haltRollout: breaker.haltRollout,
    reasons: breaker.breakerReasons,
    advisoryOnly: true
  };
}
