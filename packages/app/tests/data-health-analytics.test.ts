import { describe, expect, test } from 'vitest';
import {
  aggregateBlockerTrends,
  aggregateConfidenceDrift,
  aggregateHotspotSources,
  aggregatePipelineFailures,
  aggregateSourceLeaderboard,
  calculateDuplicateBacklog
} from '@/lib/admin/data-health';

describe('data health analytics service', () => {
  test('calculates duplicate backlog severity, aging, and false-positive trend', () => {
    const now = new Date('2026-03-31T12:00:00.000Z');
    const summary = calculateDuplicateBacklog(
      [
        {
          source: 'feed-a',
          sourceUrl: 'https://a.test/1',
          resolutionStatus: 'unresolved',
          matchConfidence: 0.95,
          unresolvedBlockerCount: 3,
          conflictingSourceCount: 1,
          createdAt: new Date('2026-03-21T12:00:00.000Z')
        },
        {
          source: 'feed-a',
          sourceUrl: 'https://a.test/2',
          resolutionStatus: 'unresolved',
          matchConfidence: 0.7,
          unresolvedBlockerCount: 0,
          conflictingSourceCount: 0,
          createdAt: new Date('2026-03-30T12:00:00.000Z')
        },
        {
          source: 'feed-b',
          sourceUrl: 'https://b.test/1',
          resolutionStatus: 'false_positive',
          matchConfidence: 0.8,
          unresolvedBlockerCount: 0,
          conflictingSourceCount: 0,
          createdAt: new Date('2026-03-29T12:00:00.000Z')
        },
        {
          source: 'feed-b',
          sourceUrl: 'https://b.test/2',
          resolutionStatus: 'resolved_separate',
          matchConfidence: 0.4,
          unresolvedBlockerCount: 0,
          conflictingSourceCount: 0,
          createdAt: new Date('2026-03-29T12:00:00.000Z')
        }
      ],
      now
    );

    expect(summary.unresolvedBySeverity.critical).toBe(1);
    expect(summary.agingBuckets.gt_7d).toBe(1);
    expect(summary.agingBuckets.d1_3).toBe(1);
    expect(summary.falsePositiveRate).toBe(0.5);
    expect(summary.separateRate).toBe(0.5);
  });

  test('aggregates source leaderboard and hotspot urls', () => {
    const rows = [
      {
        source: 'feed-a',
        sourceUrl: 'https://a.test/dup',
        resolutionStatus: 'unresolved' as const,
        matchConfidence: 0.9,
        unresolvedBlockerCount: 2,
        conflictingSourceCount: 0,
        createdAt: new Date('2026-03-30T12:00:00.000Z')
      },
      {
        source: 'feed-a',
        sourceUrl: 'https://a.test/dup',
        resolutionStatus: 'unresolved' as const,
        matchConfidence: 0.88,
        unresolvedBlockerCount: 1,
        conflictingSourceCount: 1,
        createdAt: new Date('2026-03-30T12:00:00.000Z')
      },
      {
        source: 'feed-b',
        sourceUrl: 'https://b.test/dup',
        resolutionStatus: 'false_positive' as const,
        matchConfidence: 0.5,
        unresolvedBlockerCount: 0,
        conflictingSourceCount: 0,
        createdAt: new Date('2026-03-30T12:00:00.000Z')
      }
    ];

    const leaderboard = aggregateSourceLeaderboard(rows);
    const hotspots = aggregateHotspotSources(rows);

    expect(leaderboard[0]?.source).toBe('feed-a');
    expect(leaderboard[0]?.unresolved).toBe(2);
    expect(hotspots[0]).toEqual(['https://a.test/dup', 2]);
  });

  test('aggregates pipeline failures and blocker trends', () => {
    const pipeline = aggregatePipelineFailures([
      { stage: 'extract', status: 'failure', detail: 'parser mismatch on schema', metadata: {}, createdAt: new Date() },
      { stage: 'fetch', status: 'failure', detail: 'response_too_large payload', metadata: {}, createdAt: new Date() },
      { stage: 'fetch', status: 'skip', detail: 'unhealthy source quarantine', metadata: {}, createdAt: new Date() }
    ]);

    expect(pipeline.failedExtractionJobs).toBe(1);
    expect(pipeline.parserFailureSpike).toBe(1);
    expect(pipeline.oversizedPayloadFailures).toBe(1);
    expect(pipeline.unhealthySourceSkips).toBe(1);

    const blockers = aggregateBlockerTrends([
      { source: 'feed-a', blockers: ['2 field(s) have not been reviewed.', '1 unresolved duplicate candidate(s) require an explicit resolution.'] },
      { source: 'feed-a', blockers: ['1 unresolved duplicate candidate(s) require an explicit resolution.'] },
      { source: 'feed-b', blockers: ['rollback instability threshold exceeded'] }
    ]);

    expect(blockers.blockerTotals).toBe(3);
    expect(blockers.rootCauseRanking[0]).toEqual(['unresolved_duplicates', 2]);
    expect(blockers.duplicateBlockerShare).toBe(0.67);
    expect(blockers.topBlockedSources[0]).toEqual(['feed-a', 2]);
  });

  test('calculates confidence drift thresholds', () => {
    const drift = aggregateConfidenceDrift([
      { createdAt: new Date('2026-03-20T00:00:00.000Z'), confidenceScore: 80 },
      { createdAt: new Date('2026-03-21T00:00:00.000Z'), confidenceScore: 78 },
      { createdAt: new Date('2026-03-29T00:00:00.000Z'), confidenceScore: 55 },
      { createdAt: new Date('2026-03-30T00:00:00.000Z'), confidenceScore: 50 }
    ]);

    expect(drift.previousAverage).toBe(79);
    expect(drift.currentAverage).toBe(52.5);
    expect(drift.drift).toBe(-26.5);
    expect(drift.severity).toBe('critical');
  });
});
