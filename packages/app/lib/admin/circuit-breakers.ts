export interface CircuitBreakerInput {
  blockerDriftRate: number;
  rollbackRate: number;
  canaryFailureRate: number;
  unresolvedDuplicateBlockers: number;
}

export interface CircuitBreakerResult {
  haltRollout: boolean;
  breakerReasons: string[];
  requiresExplicitAck: boolean;
}

export function evaluateCircuitBreakers(input: CircuitBreakerInput): CircuitBreakerResult {
  const reasons: string[] = [];

  if (input.unresolvedDuplicateBlockers > 0) {
    reasons.push('Duplicate/corroboration blockers unresolved.');
  }
  if (input.blockerDriftRate >= 0.15) {
    reasons.push(`Blocker drift breached threshold (${Math.round(input.blockerDriftRate * 100)}%).`);
  }
  if (input.rollbackRate >= 0.1) {
    reasons.push(`Rollback instability is elevated (${Math.round(input.rollbackRate * 100)}%).`);
  }
  if (input.canaryFailureRate >= 0.08) {
    reasons.push(`Canary failure rate exceeded (${Math.round(input.canaryFailureRate * 100)}%).`);
  }

  return {
    haltRollout: reasons.length > 0,
    breakerReasons: reasons,
    requiresExplicitAck: reasons.length > 0
  };
}
