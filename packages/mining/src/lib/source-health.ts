import { prisma } from './db.js';

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
  await prisma.trustedSource.update({
    where: { id: sourceId },
    data: {
      lastFailureAt: new Date(),
      failureCount: {
        increment: 1
      },
      notes: reason
    }
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
