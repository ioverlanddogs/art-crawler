import type { DuplicateResolutionStatus } from '@/lib/prisma-client';

export type DuplicateSnapshotRow = {
  source: string | null;
  sourceUrl: string | null;
  resolutionStatus: DuplicateResolutionStatus;
  matchConfidence: number;
  unresolvedBlockerCount: number;
  conflictingSourceCount: number;
  createdAt: Date;
};

export type DuplicateBacklogSummary = {
  unresolvedBySeverity: Record<'critical' | 'high' | 'medium' | 'low', number>;
  agingBuckets: Record<'lt_24h' | 'd1_3' | 'd3_7' | 'gt_7d', number>;
  falsePositiveRate: number;
  separateRate: number;
  mergeDistribution: Record<'resolved_merge' | 'resolved_separate' | 'false_positive' | 'escalated' | 'unresolved', number>;
};

export function calculateDuplicateBacklog(rows: DuplicateSnapshotRow[], now = new Date()): DuplicateBacklogSummary {
  const unresolvedBySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  const agingBuckets = { lt_24h: 0, d1_3: 0, d3_7: 0, gt_7d: 0 };
  const mergeDistribution = {
    resolved_merge: 0,
    resolved_separate: 0,
    false_positive: 0,
    escalated: 0,
    unresolved: 0
  };

  let resolvedCount = 0;
  let falsePositiveCount = 0;
  let separateCount = 0;

  for (const row of rows) {
    mergeDistribution[row.resolutionStatus] += 1;

    if (row.resolutionStatus !== 'unresolved') {
      resolvedCount += 1;
      if (row.resolutionStatus === 'false_positive') falsePositiveCount += 1;
      if (row.resolutionStatus === 'resolved_separate') separateCount += 1;
      continue;
    }

    const severity = classifyDuplicateSeverity(row);
    unresolvedBySeverity[severity] += 1;

    const ageHours = (now.getTime() - row.createdAt.getTime()) / (60 * 60 * 1000);
    if (ageHours < 24) agingBuckets.lt_24h += 1;
    else if (ageHours < 72) agingBuckets.d1_3 += 1;
    else if (ageHours < 168) agingBuckets.d3_7 += 1;
    else agingBuckets.gt_7d += 1;
  }

  return {
    unresolvedBySeverity,
    agingBuckets,
    falsePositiveRate: resolvedCount > 0 ? round2(falsePositiveCount / resolvedCount) : 0,
    separateRate: resolvedCount > 0 ? round2(separateCount / resolvedCount) : 0,
    mergeDistribution
  };
}

export function aggregateSourceLeaderboard(rows: DuplicateSnapshotRow[]) {
  const bucket = new Map<string, { total: number; unresolved: number; highRisk: number; falsePositive: number }>();

  for (const row of rows) {
    const source = row.source ?? 'unknown';
    const current = bucket.get(source) ?? { total: 0, unresolved: 0, highRisk: 0, falsePositive: 0 };
    current.total += 1;
    if (row.resolutionStatus === 'unresolved') current.unresolved += 1;
    if (classifyDuplicateSeverity(row) === 'critical' || classifyDuplicateSeverity(row) === 'high') current.highRisk += 1;
    if (row.resolutionStatus === 'false_positive') current.falsePositive += 1;
    bucket.set(source, current);
  }

  return [...bucket.entries()]
    .map(([source, value]) => ({
      source,
      total: value.total,
      unresolved: value.unresolved,
      averageDuplicateRisk: round2(value.highRisk / Math.max(1, value.total)),
      falsePositiveRate: round2(value.falsePositive / Math.max(1, value.total))
    }))
    .sort((a, b) => b.unresolved - a.unresolved || b.averageDuplicateRisk - a.averageDuplicateRisk);
}

export function aggregatePipelineFailures(
  rows: Array<{ stage: string; status: string; detail: string | null; metadata: unknown; createdAt: Date }>
) {
  const failed = rows.filter((row) => row.status === 'failure');
  const parserFailureSpike = failed.filter((row) => row.stage === 'extract' || includesAny(row.detail, ['parser', 'schema mismatch'])).length;
  const oversizedPayloadFailures = failed.filter((row) => includesAny(row.detail, ['too_large', 'response_too_large', 'payload'])).length;
  const unhealthySourceSkips = rows.filter((row) => row.status === 'skip' && includesAny(row.detail, ['unhealthy source', 'quarantine'])).length;

  return {
    failedExtractionJobs: failed.filter((row) => row.stage === 'extract').length,
    parserFailureSpike,
    oversizedPayloadFailures,
    unhealthySourceSkips,
    byStage: failed.reduce<Record<string, number>>((acc, row) => {
      acc[row.stage] = (acc[row.stage] ?? 0) + 1;
      return acc;
    }, {})
  };
}

export function aggregateBlockerTrends(rows: Array<{ blockers: string[]; source: string | null }>) {
  const rootCause = new Map<string, number>();
  const blockedSources = new Map<string, number>();

  for (const row of rows) {
    const source = row.source ?? 'unknown';
    blockedSources.set(source, (blockedSources.get(source) ?? 0) + 1);

    for (const blocker of row.blockers) {
      const category = classifyBlocker(blocker);
      rootCause.set(category, (rootCause.get(category) ?? 0) + 1);
    }
  }

  const rankedRootCauses = [...rootCause.entries()].sort((a, b) => b[1] - a[1]);
  const topBlockedSources = [...blockedSources.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return {
    blockerTotals: rows.length,
    rootCauseRanking: rankedRootCauses,
    topBlockedSources,
    duplicateBlockerShare:
      rows.length === 0
        ? 0
        : round2(
            rows.filter((row) => row.blockers.some((blocker) => classifyBlocker(blocker) === 'unresolved_duplicates')).length / rows.length
          )
  };
}

export function aggregateConfidenceDrift(rows: Array<{ createdAt: Date; confidenceScore: number }>) {
  if (rows.length === 0) return { currentAverage: 0, previousAverage: 0, drift: 0, severity: 'info' as const };

  const sorted = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const midpoint = Math.max(1, Math.floor(sorted.length / 2));
  const previous = sorted.slice(0, midpoint);
  const current = sorted.slice(midpoint);

  const previousAverage = avg(previous.map((row) => row.confidenceScore));
  const currentAverage = avg(current.map((row) => row.confidenceScore));
  const drift = round2(currentAverage - previousAverage);

  const severity = drift <= -15 ? 'critical' : drift <= -7 ? 'warning' : 'info';
  return { currentAverage: round2(currentAverage), previousAverage: round2(previousAverage), drift, severity };
}

export function aggregateHotspotSources(rows: DuplicateSnapshotRow[]) {
  const urls = new Map<string, number>();
  for (const row of rows) {
    if (!row.sourceUrl) continue;
    if (row.resolutionStatus !== 'unresolved') continue;
    urls.set(row.sourceUrl, (urls.get(row.sourceUrl) ?? 0) + 1);
  }

  return [...urls.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
}

export function classifyBlocker(blocker: string) {
  const normalized = blocker.toLowerCase();
  if (normalized.includes('review')) return 'missing_reviews';
  if (normalized.includes('duplicate')) return 'unresolved_duplicates';
  if (normalized.includes('corroboration') || normalized.includes('conflict')) return 'corroboration_conflicts';
  if (normalized.includes('low-confidence') || normalized.includes('confidence')) return 'low_confidence_required_fields';
  if (normalized.includes('stale')) return 'stale_source_evidence';
  if (normalized.includes('rollback')) return 'rollback_instability';
  if (normalized.includes('hotspot')) return 'duplicate_hotspot_risk';
  return 'other';
}

function classifyDuplicateSeverity(row: DuplicateSnapshotRow): 'critical' | 'high' | 'medium' | 'low' {
  if (row.unresolvedBlockerCount > 2 || row.conflictingSourceCount > 2 || row.matchConfidence >= 0.92) return 'critical';
  if (row.unresolvedBlockerCount > 0 || row.conflictingSourceCount > 0 || row.matchConfidence >= 0.82) return 'high';
  if (row.matchConfidence >= 0.65) return 'medium';
  return 'low';
}

function includesAny(value: string | null, needles: string[]) {
  const text = value?.toLowerCase() ?? '';
  return needles.some((needle) => text.includes(needle));
}

function avg(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
