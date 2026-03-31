import { describe, expect, test } from 'vitest';
import { scorePublishReadiness, simulateStagedRelease } from '@/lib/admin/publish-readiness';
import { calibrateRecommendationConfidence, summarizeModelFeedback } from '@/lib/admin/model-feedback';
import { evaluateGovernancePolicies } from '@/lib/admin/governance-policy';
import { recommendationNeverAutoPublishes, recommendReviewActions } from '@/lib/admin/triage-recommendations';

describe('Milestone E stabilization safety coverage', () => {
  test('E1 readiness remains blocker-safe even with high advisory score inputs', () => {
    const blocked = scorePublishReadiness({
      proposedDataJson: { title: 'Blocked Event', startAt: '2026-06-01T00:00:00Z' },
      fieldReviews: [
        { fieldPath: 'title', decision: 'accepted', confidence: 0.99 },
        { fieldPath: 'startAt', decision: 'accepted', confidence: 0.99 }
      ],
      duplicateCandidates: [
        {
          id: 'dup-blocker-1',
          resolutionStatus: 'unresolved',
          conflictingSourceCount: 0,
          unresolvedBlockerCount: 1,
          corroborationSourceCount: 0,
          corroborationConfidence: 0.1
        }
      ],
      extractionCompleteness: 0.99,
      sourcePerformance: 0.99,
      trustTierScore: 0.99,
      staleEvidenceHours: 0,
      staleSourceHours: 0,
      rollbackHistoryCount: 0
    });

    const simulation = simulateStagedRelease([
      {
        eventId: 'evt-blocked',
        title: 'Blocked Event',
        input: {
          proposedDataJson: { title: 'Blocked Event', startAt: '2026-06-01T00:00:00Z' },
          fieldReviews: [
            { fieldPath: 'title', decision: 'accepted', confidence: 0.99 },
            { fieldPath: 'startAt', decision: 'accepted', confidence: 0.99 }
          ],
          duplicateCandidates: [
            {
              id: 'dup-blocker-2',
              resolutionStatus: 'unresolved',
              conflictingSourceCount: 1,
              unresolvedBlockerCount: 2,
              corroborationSourceCount: 0,
              corroborationConfidence: 0.1
            }
          ]
        }
      }
    ]);

    expect(blocked.ready).toBe(false);
    expect(blocked.blockers.length).toBeGreaterThan(0);
    expect(simulation.blockedNow).toContain('evt-blocked');
    expect(simulation.publishReadyNow).not.toContain('evt-blocked');
  });

  test('E2 feedback summarization and calibration are deterministic on sparse inputs and remain assistive-only', () => {
    const sparseSummaryA = summarizeModelFeedback([
      {
        sourceClass: 'sparse',
        fieldSignals: [],
        duplicateSignals: [],
        replaySignals: [{ replayImproved: false, fallbackParserUsed: true }],
        rollbackSignals: []
      }
    ]);

    const sparseSummaryB = summarizeModelFeedback([
      {
        sourceClass: 'sparse',
        fieldSignals: [],
        duplicateSignals: [],
        replaySignals: [{ replayImproved: false, fallbackParserUsed: true }],
        rollbackSignals: []
      }
    ]);

    expect(sparseSummaryA).toEqual(sparseSummaryB);
    expect(sparseSummaryA.fieldCorrectionRates).toEqual([]);
    expect(sparseSummaryA.duplicateRecommendationPrecision).toBe(0);
    expect(sparseSummaryA.fallbackEffectiveness).toBe(0);

    const calibrated = calibrateRecommendationConfidence({
      baseConfidence: 0.7,
      reviewerOverrideRate: 0.2,
      rollbackPenaltyRate: 0.1,
      duplicatePrecision: 0.8
    });

    const recommendations = recommendReviewActions({
      unresolvedDuplicateCount: 1,
      lowConfidenceCount: 2,
      unreviewedCount: 5,
      conflictCount: 0,
      staleHours: 36
    });

    expect(calibrated.requiresHumanDecision).toBe(true);
    expect(recommendationNeverAutoPublishes(recommendations)).toBe(true);
  });

  test('E3 governance policies stay scope-aware and bounded without scope leakage', () => {
    const workspaceEval = evaluateGovernancePolicies({
      scope: { scope: 'workspace' },
      unresolvedPublishBlockers: 0,
      sourceFailureRate: 0.42,
      staleEvidenceHours: 57,
      rollbackRate: 0.1,
      overdueSlaHours: 19,
      duplicateSeverity: 'medium'
    });

    const globalEval = evaluateGovernancePolicies({
      scope: { scope: 'global' },
      unresolvedPublishBlockers: 0,
      sourceFailureRate: 0.42,
      staleEvidenceHours: 57,
      rollbackRate: 0.1,
      overdueSlaHours: 19,
      duplicateSeverity: 'medium'
    });

    expect(workspaceEval.firedPolicies.some((p) => p.policyId === 'stale_evidence_guard')).toBe(true);
    expect(workspaceEval.firedPolicies.some((p) => p.policyId === 'sla_auto_escalation')).toBe(true);
    expect(globalEval.firedPolicies.some((p) => p.policyId === 'stale_evidence_guard')).toBe(false);
    expect(globalEval.firedPolicies.some((p) => p.policyId === 'sla_auto_escalation')).toBe(false);
    expect(workspaceEval.allowAutoPublish).toBe(false);
    expect(workspaceEval.allowAutoCanonicalMerge).toBe(false);
    expect(workspaceEval.firedPolicies.every((p) => p.scope === 'workspace')).toBe(true);
  });
});
