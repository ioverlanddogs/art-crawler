import { prisma } from './db.js';
import { buildFallbackChain, evaluateReliabilityBreaches, shouldReleaseQuarantine } from './self-healing.js';

const SOURCE_FAILURE_THRESHOLD = 5;

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

  const fallbackChain = buildFallbackChain(reason);
  const decision = evaluateReliabilityBreaches({
    parserFailures: reason.startsWith('extraction_') ? 1 : 0,
    duplicateSpikes: reason.startsWith('dedup_') ? 1 : 0,
    falsePositiveSpikes: reason.includes('false_positive') ? 1 : 0,
    oversizedPayloadSpikes: reason === 'response_too_large' ? 1 : 0,
    rollbackSpikes: reason.includes('rollback') ? 1 : 0,
    confidenceCollapseSpikes: reason.includes('confidence_collapse') ? 1 : 0,
    failureCount: updated.failureCount
  });

  await prisma.pipelineTelemetry.create({
    data: {
      stage: 'self_heal',
      status: 'success',
      configVersion: 1,
      detail: JSON.stringify({
        sourceId,
        action: 'fallback_orchestration',
        reason,
        fallbackChain
      })
    }
  });

  if (decision.breached) {
    const loweredTier = Math.max(updated.trustTier - 1, 1);
    await prisma.trustedSource.update({
      where: { id: sourceId },
      data: {
        status: 'PAUSED',
        trustTier: loweredTier,
        notes: `quarantined:${decision.breachType}:${reason}`
      }
    });

    await prisma.pipelineTelemetry.create({
      data: {
        stage: 'self_heal',
        status: 'success',
        configVersion: 1,
        detail: JSON.stringify({
          sourceId,
          action: 'auto_quarantine',
          breachType: decision.breachType,
          actions: decision.actions
        })
      }
    });
  }
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
  const snapshot = {
    parserFailures: 0,
    duplicateSpikes: 0,
    falsePositiveSpikes: 0,
    oversizedPayloadSpikes: 0,
    rollbackSpikes: 0,
    confidenceCollapseSpikes: 0,
    failureCount: source.failureCount
  };

  if (!shouldReleaseQuarantine(snapshot)) {
    return false;
  }

  await prisma.trustedSource.update({
    where: { id: sourceId },
    data: {
      status: 'ACTIVE',
      notes: 'auto_recovered_after_stable_window'
    }
  });
  await prisma.pipelineTelemetry.create({
    data: {
      stage: 'self_heal',
      status: 'success',
      configVersion: 1,
      detail: JSON.stringify({ sourceId, action: 'release_quarantine' })
    }
  });
  return true;
}

export async function reverseFalseQuarantine(sourceId: string, actor = 'manual_override') {
  await prisma.trustedSource.update({
    where: { id: sourceId },
    data: {
      status: 'ACTIVE',
      notes: `false_quarantine_reversal:${actor}`,
      failureCount: 0
    }
  });
  await prisma.pipelineTelemetry.create({
    data: {
      stage: 'self_heal',
      status: 'success',
      configVersion: 1,
      detail: JSON.stringify({ sourceId, action: 'reverse_false_quarantine', actor })
    }
  });
}
