import { describe, expect, test } from 'vitest';
import { scorePublishReadiness, simulateStagedRelease } from '@/lib/admin/publish-readiness';

describe('publish readiness scoring', () => {
  test('computes explainable readiness/risk and blocker severity', () => {
    const result = scorePublishReadiness({
      proposedDataJson: { title: 'Show', startAt: '2026-04-01T00:00:00Z' },
      fieldReviews: [
        { fieldPath: 'title', decision: 'accepted', confidence: 0.9 },
        { fieldPath: 'startAt', decision: 'accepted', confidence: 0.8 }
      ],
      duplicateCandidates: [],
      extractionCompleteness: 0.95,
      sourcePerformance: 0.9,
      trustTierScore: 0.85,
      staleEvidenceHours: 4,
      rollbackHistoryCount: 0
    });

    expect(result.ready).toBe(true);
    expect(result.publishReadinessScore).toBeGreaterThan(60);
    expect(result.publishRiskScore).toBeLessThan(40);
    expect(result.blockerSeverityBreakdown.critical).toBe(0);
  });

  test('weights duplicate/corroboration and stale evidence penalties', () => {
    const result = scorePublishReadiness({
      proposedDataJson: { title: 'Show', startAt: '2026-04-01T00:00:00Z' },
      fieldReviews: [
        { fieldPath: 'title', decision: 'accepted', confidence: 0.3 },
        { fieldPath: 'startAt', decision: 'accepted', confidence: 0.2 }
      ],
      duplicateCandidates: [{ id: 'dup-1', resolutionStatus: 'unresolved', conflictingSourceCount: 2, unresolvedBlockerCount: 1, corroborationSourceCount: 0, corroborationConfidence: 0.2 }],
      extractionCompleteness: 0.5,
      sourcePerformance: 0.5,
      trustTierScore: 0.45,
      staleEvidenceHours: 80,
      rollbackHistoryCount: 2
    });

    expect(result.ready).toBe(false);
    expect(result.duplicateCorroborationRiskContribution).toBeLessThanOrEqual(-12);
    expect(result.dataFreshnessIndicator).toBe('stale');
    expect(result.rollbackRiskIndicator).toBe('high');
    expect(result.publishRiskScore).toBeGreaterThan(70);
  });

  test('simulates staged release and identifies rollback-prone records', () => {
    const simulation = simulateStagedRelease([
      {
        eventId: 'evt-ready',
        title: 'Ready',
        input: {
          proposedDataJson: { title: 'A', startAt: '2026-05-01' },
          fieldReviews: [
            { fieldPath: 'title', decision: 'accepted', confidence: 0.9 },
            { fieldPath: 'startAt', decision: 'accepted', confidence: 0.9 }
          ],
          duplicateCandidates: []
        }
      },
      {
        eventId: 'evt-risky',
        title: 'Risky',
        input: {
          proposedDataJson: { title: 'B', startAt: '2026-05-02' },
          fieldReviews: [
            { fieldPath: 'title', decision: 'accepted', confidence: 0.2 },
            { fieldPath: 'startAt', decision: 'accepted', confidence: 0.3 }
          ],
          duplicateCandidates: [{ id: 'dup-2', resolutionStatus: 'resolved_merge', conflictingSourceCount: 0, unresolvedBlockerCount: 0, corroborationSourceCount: 2, corroborationConfidence: 0.8 }],
          rollbackHistoryCount: 3,
          staleEvidenceHours: 90
        }
      }
    ]);

    expect(simulation.publishReadyNow).toContain('evt-ready');
    expect(simulation.rollbackProne).toContain('evt-risky');
    expect(simulation.topRiskyRecords[0]?.eventId).toBe('evt-risky');
  });
});
