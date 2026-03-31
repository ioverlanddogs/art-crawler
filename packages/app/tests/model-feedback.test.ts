import { describe, expect, test } from 'vitest';
import { calibrateRecommendationConfidence, summarizeModelFeedback } from '@/lib/admin/model-feedback';

describe('model feedback optimization loop', () => {
  test('aggregates field correction and parser/model performance', () => {
    const summary = summarizeModelFeedback([
      {
        sourceClass: 'venue_feed',
        fieldSignals: [
          { fieldPath: 'title', accepted: true, editedAfterExtraction: false, uncertain: false, parserVersion: 'p1', modelVersion: 'm1' },
          { fieldPath: 'title', accepted: false, editedAfterExtraction: true, uncertain: true, parserVersion: 'p1', modelVersion: 'm1' },
          { fieldPath: 'description', accepted: true, editedAfterExtraction: true, uncertain: false, parserVersion: 'p2', modelVersion: 'm2' }
        ],
        duplicateSignals: [
          { recommendation: 'merge_fields_only', finalOutcome: 'resolved_merge' },
          { recommendation: 'false_positive', finalOutcome: 'resolved_separate' }
        ],
        replaySignals: [{ replayImproved: true, fallbackParserUsed: true }],
        rollbackSignals: [{ linkedToRollback: true, publishSucceeded: false }]
      }
    ]);

    expect(summary.fieldCorrectionRates[0]?.fieldPath).toBe('description');
    expect(summary.parserPerformance.p1.correctionRate).toBe(0.5);
    expect(summary.modelPerformance.m1.uncertainRate).toBe(0.5);
    expect(summary.duplicateRecommendationPrecision).toBe(0.5);
    expect(summary.fallbackEffectiveness).toBe(1);
    expect(summary.rollbackPenaltyRate).toBe(1);
  });

  test('calibrates recommendation confidence with override and rollback penalties', () => {
    const result = calibrateRecommendationConfidence({
      baseConfidence: 0.8,
      reviewerOverrideRate: 0.4,
      rollbackPenaltyRate: 0.25,
      duplicatePrecision: 0.9
    });

    expect(result.adjustedConfidence).toBeLessThan(0.8);
    expect(result.adjustmentSummary).toContain('base=80%');
    expect(result.requiresHumanDecision).toBe(true);
  });
});
