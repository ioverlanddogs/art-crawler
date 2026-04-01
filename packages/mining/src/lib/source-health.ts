import { prisma } from './db.js';
import {
  buildFallbackChainPlan,
  buildFalseQuarantineReversal,
  emptyReliabilitySnapshot,
  evaluateQuarantineBreach,
  evaluateReleaseReadiness,
  type FallbackActionType,
  type SourceReliabilitySnapshot
} from './self-healing.js';

const SOURCE_FAILURE_THRESHOLD = 5;
const SELF_HEAL_STAGE = 'self_heal';

type ReliabilityCounterKey =
  | 'parserFailureSpike'
  | 'duplicateSpike'
  | 'falsePositiveSpike'
  | 'oversizedPayloadSpike'
  | 'rollbackSpike'
  | 'confidenceCollapse'
  | 'unhealthySkipRate'
  | 'retryHotspotCount';

function spikeKeyForReason(reason: string): ReliabilityCounterKey | null {
  if (reason.startsWith('extraction_')) return 'parserFailureSpike';
  if (reason.startsWith('dedup_')) return 'duplicateSpike';
  if (reason.includes('false_positive')) return 'falsePositiveSpike';
  if (reason === 'response_too_large') return 'oversizedPayloadSpike';
  if (reason.includes('rollback')) return 'rollbackSpike';
  if (reason.includes('confidence_collapse')) return 'confidenceCollapse';
  if (reason.includes('unhealthy_source_skip')) return 'unhealthySkipRate';
  if (reason.includes('retry_hotspot')) return 'retryHotspotCount';
  return null;
}

function parseReliabilityCounters(value: unknown): Partial<Record<ReliabilityCounterKey, number>> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const parsed = value as Record<string, unknown>;
  return {
    parserFailureSpike: typeof parsed.parserFailureSpike === 'number' ? parsed.parserFailureSpike : 0,
    duplicateSpike: typeof parsed.duplicateSpike === 'number' ? parsed.duplicateSpike : 0,
    falsePositiveSpike: typeof parsed.falsePositiveSpike === 'number' ? parsed.falsePositiveSpike : 0,
    oversizedPayloadSpike: typeof parsed.oversizedPayloadSpike === 'number' ? parsed.oversizedPayloadSpike : 0,
    rollbackSpike: typeof parsed.rollbackSpike === 'number' ? parsed.rollbackSpike : 0,
    confidenceCollapse: typeof parsed.confidenceCollapse === 'number' ? parsed.confidenceCollapse : 0,
    unhealthySkipRate: typeof parsed.unhealthySkipRate === 'number' ? parsed.unhealthySkipRate : 0,
    retryHotspotCount: typeof parsed.retryHotspotCount === 'number' ? parsed.retryHotspotCount : 0
  };
}

function inferReliabilitySnapshot(
  failureCount: number,
  reliabilityCounters: Partial<Record<ReliabilityCounterKey, number>>
): SourceReliabilitySnapshot {
  const snapshot = emptyReliabilitySnapshot(failureCount);
  snapshot.parserFailureSpike = reliabilityCounters.parserFailureSpike ?? 0;
  snapshot.duplicateSpike = reliabilityCounters.duplicateSpike ?? 0;
  snapshot.falsePositiveSpike = reliabilityCounters.falsePositiveSpike ?? 0;
  snapshot.oversizedPayloadSpike = reliabilityCounters.oversizedPayloadSpike ?? 0;
  snapshot.rollbackSpike = reliabilityCounters.rollbackSpike ?? 0;
  snapshot.confidenceCollapse = reliabilityCounters.confidenceCollapse ?? 0;
  snapshot.unhealthySkipRate = reliabilityCounters.unhealthySkipRate ?? 0;
  snapshot.retryHotspotCount = reliabilityCounters.retryHotspotCount ?? 0;
  return snapshot;
}

function extractReasonFromTelemetry(detail: string | null): string | null {
  if (!detail) return null;
  try {
    const parsed = JSON.parse(detail) as { reason?: unknown };
    return typeof parsed.reason === 'string' ? parsed.reason : null;
  } catch {
    return detail;
  }
}

export async function buildSnapshotFromTelemetry(sourceId: string): Promise<SourceReliabilitySnapshot> {
  const [source, failures] = await Promise.all([
    prisma.trustedSource.findUniqueOrThrow({ where: { id: sourceId } }),
    prisma.pipelineTelemetry.findMany({
      where: { sourceId, status: 'failure' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { detail: true }
    })
  ]);

  const snapshot = emptyReliabilitySnapshot(source.failureCount);
  for (const failure of failures) {
    const reason = extractReasonFromTelemetry(failure.detail);
    const spikeKey = reason ? spikeKeyForReason(reason) : null;
    if (spikeKey) {
      snapshot[spikeKey] += 1;
    }
  }

  return snapshot;
}

async function emitSelfHealingEvent(sourceId: string, event: string, detail: Record<string, unknown>) {
  await prisma.pipelineTelemetry.create({
    data: {
      sourceId,
      stage: SELF_HEAL_STAGE,
      status: 'success',
      configVersion: 1,
      detail: JSON.stringify({
        sourceId,
        event,
        ...detail
      })
    }
  });
}

async function logFallbackActions(sourceId: string, fallbackChain: FallbackActionType[], reason: string) {
  await emitSelfHealingEvent(sourceId, 'fallback_chain_applied', { reason, fallbackChain });

  for (const action of fallbackChain) {
    if (action === 'parser_fallback') {
      await emitSelfHealingEvent(sourceId, 'fallback_parser_used', { reason, action });
    }
    if (action === 'retry_policy_fallback') {
      await emitSelfHealingEvent(sourceId, 'fallback_retry_used', { reason, action });
    }
    if (action === 'lightweight_probe') {
      await emitSelfHealingEvent(sourceId, 'source_probe_run', { reason, action });
    }
  }
}

export function isSourceHealthy(source: { failureCount: number; status: string }) {
  return source.status === 'ACTIVE' && source.failureCount < SOURCE_FAILURE_THRESHOLD;
}

export async function markSourceSuccess(sourceId: string) {
  await prisma.trustedSource.update({
    where: { id: sourceId },
    data: {
      lastSuccessAt: new Date(),
      failureCount: 0
    }
  });
}

export async function markSourceFailure(sourceId: string, reason: string) {
  const source = await prisma.trustedSource.findUniqueOrThrow({ where: { id: sourceId } });
  const spikeKey = spikeKeyForReason(reason);
  const counters = parseReliabilityCounters(source.reliabilityCounters);
  const nextCounters = {
    ...counters,
    ...(spikeKey
      ? {
          [spikeKey]: (counters[spikeKey] ?? 0) + 1
        }
      : {})
  };

  const updated = await prisma.trustedSource.update({
    where: { id: sourceId },
    data: {
      lastFailureAt: new Date(),
      failureCount: {
        increment: 1
      },
      reliabilityCounters: nextCounters,
      notes: reason
    }
  });

  const fallbackPlan = buildFallbackChainPlan(reason);
  const snapshot = inferReliabilitySnapshot(updated.failureCount, parseReliabilityCounters(updated.reliabilityCounters));
  const decision = evaluateQuarantineBreach(snapshot);

  await logFallbackActions(sourceId, fallbackPlan.chain, reason);

  if (!decision.shouldQuarantine) {
    return;
  }

  const loweredTier = Math.max(updated.trustTier - 1, 1);
  await prisma.trustedSource.update({
    where: { id: sourceId },
    data: {
      status: 'PAUSED',
      trustTier: loweredTier,
      notes: `quarantine:${decision.reasons.map((entry) => entry.type).join(',') || 'failure_count'}:${reason}`
    }
  });

  await emitSelfHealingEvent(sourceId, 'source_quarantined', {
    severity: decision.severity,
    reasons: decision.reasons,
    recommendedActions: decision.recommendedActions,
    fallbackPlan: fallbackPlan.chain
  });

  await emitSelfHealingEvent(sourceId, 'source_paused', {
    severity: decision.severity,
    reason
  });

  await emitSelfHealingEvent(sourceId, 'source_deprioritized', {
    previousTrustTier: updated.trustTier,
    loweredTrustTier: loweredTier,
    reason
  });

  await emitSelfHealingEvent(sourceId, 'investigation_routed', {
    reason,
    routingHint: fallbackPlan.routeToInvestigation ? 'fallback_chain_failed_or_high_risk' : 'monitor_only'
  });
}

export async function buildSourceHealthReport(sourceId: string) {
  const [source, discoverySuccess, fetchSuccess, extractSuccess, exportYield] = await Promise.all([
    prisma.trustedSource.findUniqueOrThrow({ where: { id: sourceId } }),
    prisma.pipelineTelemetry.count({ where: { sourceId, stage: 'discovery', status: 'success' } }),
    prisma.pipelineTelemetry.count({ where: { sourceId, stage: 'fetch', status: 'success' } }),
    prisma.pipelineTelemetry.count({ where: { sourceId, stage: 'extract', status: 'success' } }),
    prisma.pipelineTelemetry.count({ where: { sourceId, stage: 'export', status: 'success' } })
  ]);

  return {
    sourceId,
    sourceName: source.name,
    discoverySuccess,
    fetchSuccess,
    extractionSuccess: extractSuccess,
    exportYield,
    failureCount: source.failureCount,
    lastSuccessAt: source.lastSuccessAt,
    lastFailureAt: source.lastFailureAt
  };
}

export async function attemptSourceRecoveryRelease(sourceId: string) {
  const source = await prisma.trustedSource.findUniqueOrThrow({ where: { id: sourceId } });
  const snapshot = await buildSnapshotFromTelemetry(sourceId);
  snapshot.failureCount = source.failureCount;
  const readiness = evaluateReleaseReadiness(snapshot);

  if (!readiness.eligible) {
    await emitSelfHealingEvent(sourceId, 'source_release_blocked', {
      reasons: readiness.reasons,
      confidenceRecovered: readiness.confidenceRecovered
    });
    return false;
  }

  await prisma.trustedSource.update({
    where: { id: sourceId },
    data: {
      status: 'ACTIVE',
      notes: 'auto_recovered_after_stable_window'
    }
  });

  await emitSelfHealingEvent(sourceId, 'source_released', {
    reason: 'recovered_after_stable_window',
    confidenceRecovered: readiness.confidenceRecovered,
    releaseEvidence: 'all_spikes_clear_and_failure_count_stable'
  });

  return true;
}

export async function reverseFalseQuarantine(sourceId: string, actor = 'manual_override') {
  const reversal = buildFalseQuarantineReversal({
    confidenceRecovered: true,
    hasManualOverride: true,
    quarantineTriggeredBySingleSignal: false,
    actor
  });

  if (!reversal.shouldReverse) {
    return;
  }

  await prisma.trustedSource.update({
    where: { id: sourceId },
    data: {
      status: 'ACTIVE',
      notes: `false_quarantine_reversal:${reversal.reason}`,
      failureCount: 0
    }
  });

  await emitSelfHealingEvent(sourceId, 'false_quarantine_reversed', {
    action: reversal.action,
    reversalReason: reversal.reason
  });
}
