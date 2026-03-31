export interface FieldReviewSignal {
  fieldPath: string;
  accepted: boolean;
  editedAfterExtraction: boolean;
  uncertain: boolean;
  parserVersion?: string | null;
  modelVersion?: string | null;
}

export interface DuplicateOutcomeSignal {
  recommendation: 'merge_fields_only' | 'false_positive' | 'separate_record';
  finalOutcome: 'resolved_merge' | 'false_positive' | 'resolved_separate' | 'unresolved';
}

export interface ReplayOutcomeSignal {
  replayImproved: boolean;
  fallbackParserUsed: boolean;
}

export interface RollbackSignal {
  linkedToRollback: boolean;
  publishSucceeded: boolean;
}

export interface ModelFeedbackSnapshot {
  fieldSignals: FieldReviewSignal[];
  duplicateSignals: DuplicateOutcomeSignal[];
  replaySignals: ReplayOutcomeSignal[];
  rollbackSignals: RollbackSignal[];
  sourceClass: string;
}

export interface ModelFeedbackSummary {
  fieldCorrectionRates: Array<{ fieldPath: string; correctionRate: number }>;
  parserPerformance: Record<string, { total: number; correctionRate: number }>;
  modelPerformance: Record<string, { total: number; uncertainRate: number }>;
  duplicateRecommendationPrecision: number;
  mergeStrategySuccessRate: number;
  sourceClassExtractionReliability: number;
  fallbackEffectiveness: number;
  rollbackPenaltyRate: number;
}

export function summarizeModelFeedback(snapshots: ModelFeedbackSnapshot[]): ModelFeedbackSummary {
  const fieldBucket = new Map<string, { total: number; corrections: number }>();
  const parserPerformance: Record<string, { total: number; corrections: number }> = {};
  const modelPerformance: Record<string, { total: number; uncertain: number }> = {};

  let duplicateCorrect = 0;
  let duplicateTotal = 0;
  let mergeSuccess = 0;
  let mergeTotal = 0;

  let sourceAccepted = 0;
  let sourceTotal = 0;

  let fallbackWins = 0;
  let fallbackTotal = 0;

  let rollbackLinked = 0;
  let rollbackFailed = 0;

  for (const snapshot of snapshots) {
    for (const field of snapshot.fieldSignals) {
      const bucket = fieldBucket.get(field.fieldPath) ?? { total: 0, corrections: 0 };
      bucket.total += 1;
      if (field.editedAfterExtraction || !field.accepted) bucket.corrections += 1;
      fieldBucket.set(field.fieldPath, bucket);

      if (field.accepted) sourceAccepted += 1;
      sourceTotal += 1;

      const parserKey = field.parserVersion ?? 'unknown';
      parserPerformance[parserKey] = parserPerformance[parserKey] ?? { total: 0, corrections: 0 };
      parserPerformance[parserKey].total += 1;
      if (field.editedAfterExtraction || !field.accepted) parserPerformance[parserKey].corrections += 1;

      const modelKey = field.modelVersion ?? 'unknown';
      modelPerformance[modelKey] = modelPerformance[modelKey] ?? { total: 0, uncertain: 0 };
      modelPerformance[modelKey].total += 1;
      if (field.uncertain) modelPerformance[modelKey].uncertain += 1;
    }

    for (const signal of snapshot.duplicateSignals) {
      duplicateTotal += 1;
      if (
        (signal.recommendation === 'merge_fields_only' && signal.finalOutcome === 'resolved_merge') ||
        (signal.recommendation === 'false_positive' && signal.finalOutcome === 'false_positive') ||
        (signal.recommendation === 'separate_record' && signal.finalOutcome === 'resolved_separate')
      ) {
        duplicateCorrect += 1;
      }
      if (signal.recommendation === 'merge_fields_only') {
        mergeTotal += 1;
        if (signal.finalOutcome === 'resolved_merge') mergeSuccess += 1;
      }
    }

    for (const replay of snapshot.replaySignals) {
      if (!replay.fallbackParserUsed) continue;
      fallbackTotal += 1;
      if (replay.replayImproved) fallbackWins += 1;
    }

    for (const rollback of snapshot.rollbackSignals) {
      if (!rollback.linkedToRollback) continue;
      rollbackLinked += 1;
      if (!rollback.publishSucceeded) rollbackFailed += 1;
    }
  }

  return {
    fieldCorrectionRates: [...fieldBucket.entries()]
      .map(([fieldPath, value]) => ({ fieldPath, correctionRate: ratio(value.corrections, value.total) }))
      .sort((a, b) => b.correctionRate - a.correctionRate),
    parserPerformance: Object.fromEntries(
      Object.entries(parserPerformance).map(([key, value]) => [key, { total: value.total, correctionRate: ratio(value.corrections, value.total) }])
    ),
    modelPerformance: Object.fromEntries(
      Object.entries(modelPerformance).map(([key, value]) => [key, { total: value.total, uncertainRate: ratio(value.uncertain, value.total) }])
    ),
    duplicateRecommendationPrecision: ratio(duplicateCorrect, duplicateTotal),
    mergeStrategySuccessRate: ratio(mergeSuccess, mergeTotal),
    sourceClassExtractionReliability: ratio(sourceAccepted, sourceTotal),
    fallbackEffectiveness: ratio(fallbackWins, fallbackTotal),
    rollbackPenaltyRate: ratio(rollbackFailed, rollbackLinked)
  };
}

export function calibrateRecommendationConfidence(input: {
  baseConfidence: number;
  reviewerOverrideRate: number;
  rollbackPenaltyRate: number;
  duplicatePrecision: number;
}) {
  const overridePenalty = clamp01(input.reviewerOverrideRate) * 0.25;
  const rollbackPenalty = clamp01(input.rollbackPenaltyRate) * 0.2;
  const precisionBoost = clamp01(input.duplicatePrecision) * 0.15;
  const adjusted = clamp01(input.baseConfidence - overridePenalty - rollbackPenalty + precisionBoost);

  return {
    adjustedConfidence: adjusted,
    adjustmentSummary: `base=${pct(input.baseConfidence)} override_penalty=${pct(overridePenalty)} rollback_penalty=${pct(rollbackPenalty)} precision_boost=${pct(precisionBoost)}`,
    requiresHumanDecision: true as const
  };
}

function ratio(part: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100) / 100;
}

function pct(value: number) {
  return `${Math.round(clamp01(value) * 100)}%`;
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, Math.round(value * 100) / 100));
}
