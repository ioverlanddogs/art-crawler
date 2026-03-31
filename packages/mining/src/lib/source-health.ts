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

function inferReliabilitySnapshot(reason: string, failureCount: number): SourceReliabilitySnapshot {
  const snapshot = emptyReliabilitySnapshot(failureCount);

  if (reason.startsWith('extraction_')) snapshot.parserFailureSpike = 1;
  if (reason.startsWith('dedup_')) snapshot.duplicateSpike = 1;
  if (reason.includes('false_positive')) snapshot.falsePositiveSpike = 1;
  if (reason === 'response_too_large') snapshot.oversizedPayloadSpike = 1;
  if (reason.includes('rollback')) snapshot.rollbackSpike = 1;
  if (reason.includes('confidence_collapse')) snapshot.confidenceCollapse = 1;
  if (reason.includes('unhealthy_source_skip')) snapshot.unhealthySkipRate = 1;
  if (reason.includes('retry_hotspot')) snapshot.retryHotspotCount = 1;

  return snapshot;
}

async function emitSelfHealingEvent(sourceId: string, event: string, detail: Record<string, unknown>) {
  await prisma.pipelineTelemetry.create({
    data: {
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
  const updated = await prisma.trustedSource.update({
    where: { id: sourceId },
    data: {
      lastFailureAt: new Date(),
      failureCount: {
        increment: 1
      },
      notes: reason
    }
  });

  const fallbackPlan = buildFallbackChainPlan(reason);
  const snapshot = inferReliabilitySnapshot(reason, updated.failureCount);
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
    prisma.pipelineTelemetry.count({ where: { stage: 'discovery', status: 'success', detail: { contains: sourceId } } }),
    prisma.pipelineTelemetry.count({ where: { stage: 'fetch', status: 'success', detail: { contains: sourceId } } }),
    prisma.pipelineTelemetry.count({ where: { stage: 'extract', status: 'success', detail: { contains: sourceId } } }),
    prisma.pipelineTelemetry.count({ where: { stage: 'export', status: 'success', detail: { contains: sourceId } } })
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
  const readiness = evaluateReleaseReadiness(emptyReliabilitySnapshot(source.failureCount));

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
