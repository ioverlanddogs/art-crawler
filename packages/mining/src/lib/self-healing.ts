export type ReliabilityBreachType =
  | 'parser_failure_spike'
  | 'duplicate_spike'
  | 'false_positive_spike'
  | 'oversized_payload_spike'
  | 'rollback_spike'
  | 'confidence_collapse'
  | 'unhealthy_skip_rate_spike'
  | 'retry_hotspot_spike';

export type SelfHealingSeverity = 'low' | 'medium' | 'high' | 'critical';

export type SelfHealingActionType =
  | 'quarantine_source'
  | 'pause_source'
  | 'lower_priority'
  | 'route_to_investigation'
  | 'apply_fallback_chain';

export type FallbackActionType =
  | 'parser_fallback'
  | 'extraction_strategy_fallback'
  | 'retry_policy_fallback'
  | 'source_class_fallback'
  | 'html_truncation_fetch_fallback'
  | 'lightweight_probe';

export interface SourceReliabilitySnapshot {
  parserFailureSpike: number;
  duplicateSpike: number;
  falsePositiveSpike: number;
  oversizedPayloadSpike: number;
  rollbackSpike: number;
  confidenceCollapse: number;
  unhealthySkipRate: number;
  retryHotspotCount: number;
  failureCount: number;
}

export interface BreachReason {
  type: ReliabilityBreachType;
  value: number;
  threshold: number;
}

export interface QuarantineDecision {
  shouldQuarantine: boolean;
  severity: SelfHealingSeverity;
  reasons: BreachReason[];
  recommendedActions: SelfHealingActionType[];
}

export interface FallbackChainPlan {
  reason: string;
  chain: FallbackActionType[];
  routeToInvestigation: boolean;
}

export interface ReleaseReadiness {
  eligible: boolean;
  reasons: string[];
  confidenceRecovered: boolean;
}

export interface FalseQuarantineReversal {
  shouldReverse: boolean;
  action: 'manual_override' | 'system_override';
  reason: string;
}

const THRESHOLDS: Record<ReliabilityBreachType, number> = {
  parser_failure_spike: 3,
  duplicate_spike: 3,
  false_positive_spike: 2,
  oversized_payload_spike: 2,
  rollback_spike: 2,
  confidence_collapse: 2,
  unhealthy_skip_rate_spike: 3,
  retry_hotspot_spike: 4
};

function mapSnapshot(snapshot: SourceReliabilitySnapshot): Array<{ type: ReliabilityBreachType; value: number }> {
  return [
    { type: 'parser_failure_spike', value: snapshot.parserFailureSpike },
    { type: 'duplicate_spike', value: snapshot.duplicateSpike },
    { type: 'false_positive_spike', value: snapshot.falsePositiveSpike },
    { type: 'oversized_payload_spike', value: snapshot.oversizedPayloadSpike },
    { type: 'rollback_spike', value: snapshot.rollbackSpike },
    { type: 'confidence_collapse', value: snapshot.confidenceCollapse },
    { type: 'unhealthy_skip_rate_spike', value: snapshot.unhealthySkipRate },
    { type: 'retry_hotspot_spike', value: snapshot.retryHotspotCount }
  ];
}

function deriveSeverity(reasons: BreachReason[], failureCount: number): SelfHealingSeverity {
  if (reasons.length === 0 && failureCount < 5) return 'low';
  if (reasons.some((reason) => reason.type === 'confidence_collapse' || reason.type === 'rollback_spike')) return 'critical';
  if (reasons.length >= 2 || failureCount >= 6) return 'high';
  if (reasons.length === 1 || failureCount >= 4) return 'medium';
  return 'low';
}

export function evaluateQuarantineBreach(snapshot: SourceReliabilitySnapshot): QuarantineDecision {
  const reasons = mapSnapshot(snapshot)
    .filter((signal) => signal.value >= THRESHOLDS[signal.type])
    .map((signal) => ({
      type: signal.type,
      value: signal.value,
      threshold: THRESHOLDS[signal.type]
    }));

  const severity = deriveSeverity(reasons, snapshot.failureCount);
  const shouldQuarantine = reasons.length > 0 || snapshot.failureCount >= 5;
  const recommendedActions: SelfHealingActionType[] = shouldQuarantine
    ? ['quarantine_source', 'pause_source', 'lower_priority', 'apply_fallback_chain', 'route_to_investigation']
    : [];

  return { shouldQuarantine, severity, reasons, recommendedActions };
}

export function buildFallbackChainPlan(reason: string): FallbackChainPlan {
  if (reason.startsWith('fetch_failed:') || reason.startsWith('fetch_exception')) {
    return {
      reason,
      chain: ['retry_policy_fallback', 'source_class_fallback', 'lightweight_probe'],
      routeToInvestigation: true
    };
  }

  if (reason === 'response_too_large') {
    return {
      reason,
      chain: ['html_truncation_fetch_fallback', 'parser_fallback', 'retry_policy_fallback'],
      routeToInvestigation: false
    };
  }

  if (reason.startsWith('extraction_')) {
    return {
      reason,
      chain: ['parser_fallback', 'extraction_strategy_fallback', 'retry_policy_fallback', 'lightweight_probe'],
      routeToInvestigation: false
    };
  }

  if (reason.startsWith('dedup_')) {
    return {
      reason,
      chain: ['source_class_fallback', 'retry_policy_fallback', 'lightweight_probe'],
      routeToInvestigation: true
    };
  }

  return {
    reason,
    chain: ['retry_policy_fallback', 'lightweight_probe'],
    routeToInvestigation: false
  };
}

export function evaluateReleaseReadiness(snapshot: SourceReliabilitySnapshot): ReleaseReadiness {
  const reasons: string[] = [];

  if (snapshot.failureCount > 1) reasons.push('failure_count_above_release_threshold');
  if (snapshot.parserFailureSpike > 0) reasons.push('parser_failures_not_recovered');
  if (snapshot.duplicateSpike > 0) reasons.push('duplicate_rate_not_recovered');
  if (snapshot.falsePositiveSpike > 0) reasons.push('false_positive_rate_not_recovered');
  if (snapshot.oversizedPayloadSpike > 0) reasons.push('payload_size_errors_not_recovered');
  if (snapshot.rollbackSpike > 0) reasons.push('rollback_instability_not_recovered');
  if (snapshot.confidenceCollapse > 0) reasons.push('confidence_not_recovered');
  if (snapshot.unhealthySkipRate > 0) reasons.push('unhealthy_skip_rate_not_recovered');
  if (snapshot.retryHotspotCount > 0) reasons.push('retry_hotspots_not_recovered');

  return {
    eligible: reasons.length === 0,
    reasons,
    confidenceRecovered: snapshot.confidenceCollapse === 0
  };
}

export function buildFalseQuarantineReversal(input: {
  confidenceRecovered: boolean;
  hasManualOverride: boolean;
  quarantineTriggeredBySingleSignal: boolean;
  actor?: string;
}): FalseQuarantineReversal {
  if (input.hasManualOverride) {
    return {
      shouldReverse: true,
      action: 'manual_override',
      reason: `manual_override:${input.actor ?? 'operator'}`
    };
  }

  if (input.confidenceRecovered && input.quarantineTriggeredBySingleSignal) {
    return {
      shouldReverse: true,
      action: 'system_override',
      reason: 'single_signal_quarantine_recovered'
    };
  }

  return {
    shouldReverse: false,
    action: 'system_override',
    reason: 'quarantine_still_valid'
  };
}

export function emptyReliabilitySnapshot(failureCount = 0): SourceReliabilitySnapshot {
  return {
    parserFailureSpike: 0,
    duplicateSpike: 0,
    falsePositiveSpike: 0,
    oversizedPayloadSpike: 0,
    rollbackSpike: 0,
    confidenceCollapse: 0,
    unhealthySkipRate: 0,
    retryHotspotCount: 0,
    failureCount
  };
}
