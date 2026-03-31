export type ReliabilityBreachType =
  | 'parser_failure_spike'
  | 'duplicate_spike'
  | 'false_positive_spike'
  | 'oversized_payload_spike'
  | 'rollback_spike'
  | 'confidence_collapse';

export type SelfHealingActionType =
  | 'quarantine_source'
  | 'pause_source'
  | 'lower_priority'
  | 'route_to_investigation'
  | 'release_quarantine'
  | 'reverse_false_quarantine';

export interface SourceReliabilitySnapshot {
  parserFailures: number;
  duplicateSpikes: number;
  falsePositiveSpikes: number;
  oversizedPayloadSpikes: number;
  rollbackSpikes: number;
  confidenceCollapseSpikes: number;
  failureCount: number;
}

export interface SelfHealingDecision {
  breached: boolean;
  breachType?: ReliabilityBreachType;
  actions: SelfHealingActionType[];
}

const RELIABILITY_THRESHOLDS: Record<ReliabilityBreachType, number> = {
  parser_failure_spike: 3,
  duplicate_spike: 3,
  false_positive_spike: 2,
  oversized_payload_spike: 2,
  rollback_spike: 2,
  confidence_collapse: 2
};

export function evaluateReliabilityBreaches(snapshot: SourceReliabilitySnapshot): SelfHealingDecision {
  const checks: Array<{ breachType: ReliabilityBreachType; value: number }> = [
    { breachType: 'parser_failure_spike', value: snapshot.parserFailures },
    { breachType: 'duplicate_spike', value: snapshot.duplicateSpikes },
    { breachType: 'false_positive_spike', value: snapshot.falsePositiveSpikes },
    { breachType: 'oversized_payload_spike', value: snapshot.oversizedPayloadSpikes },
    { breachType: 'rollback_spike', value: snapshot.rollbackSpikes },
    { breachType: 'confidence_collapse', value: snapshot.confidenceCollapseSpikes }
  ];

  const breached = checks.find((entry) => entry.value >= RELIABILITY_THRESHOLDS[entry.breachType]);
  if (!breached && snapshot.failureCount < 5) {
    return { breached: false, actions: [] };
  }

  return {
    breached: true,
    breachType: breached?.breachType ?? 'parser_failure_spike',
    actions: ['quarantine_source', 'pause_source', 'lower_priority', 'route_to_investigation']
  };
}

export type FallbackActionType =
  | 'parser_fallback'
  | 'extraction_strategy_fallback'
  | 'retry_policy_fallback'
  | 'source_class_fallback'
  | 'html_truncation_fetch_fallback';

export function buildFallbackChain(reason: string): FallbackActionType[] {
  if (reason.startsWith('fetch_failed:') || reason.startsWith('fetch_exception')) {
    return ['retry_policy_fallback', 'source_class_fallback'];
  }
  if (reason === 'response_too_large') {
    return ['html_truncation_fetch_fallback', 'parser_fallback'];
  }
  if (reason.startsWith('extraction_')) {
    return ['parser_fallback', 'extraction_strategy_fallback', 'retry_policy_fallback'];
  }
  if (reason.startsWith('dedup_')) {
    return ['source_class_fallback', 'retry_policy_fallback'];
  }
  return ['retry_policy_fallback'];
}

export function shouldReleaseQuarantine(snapshot: SourceReliabilitySnapshot): boolean {
  return (
    snapshot.failureCount <= 1 &&
    snapshot.parserFailures === 0 &&
    snapshot.duplicateSpikes === 0 &&
    snapshot.falsePositiveSpikes === 0 &&
    snapshot.oversizedPayloadSpikes === 0 &&
    snapshot.rollbackSpikes === 0 &&
    snapshot.confidenceCollapseSpikes === 0
  );
}
