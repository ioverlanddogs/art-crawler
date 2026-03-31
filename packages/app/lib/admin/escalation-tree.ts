import { calibrateRecommendationConfidence } from '@/lib/admin/model-feedback';

export interface EscalationInput {
  itemId: string;
  riskScore: number;
  blockerCount: number;
  reviewerOverrideRate: number;
  rollbackPenaltyRate: number;
  duplicatePrecision: number;
}

export interface EscalationPath {
  itemId: string;
  level: 'L1' | 'L2' | 'L3';
  routeTo: 'reviewer' | 'queue-lead' | 'governance-council';
  calibratedConfidence: number;
  reason: string;
  requiresHumanDecision: true;
}

export function buildEscalationTree(inputs: EscalationInput[]): EscalationPath[] {
  return inputs
    .map((input) => {
      const confidence = calibrateRecommendationConfidence({
        baseConfidence: 1 - clamp01(input.riskScore),
        reviewerOverrideRate: input.reviewerOverrideRate,
        rollbackPenaltyRate: input.rollbackPenaltyRate,
        duplicatePrecision: input.duplicatePrecision
      });

      const level: EscalationPath['level'] =
        input.blockerCount > 0 || input.riskScore >= 0.85 ? 'L3' : input.riskScore >= 0.55 ? 'L2' : 'L1';
      const routeTo: EscalationPath['routeTo'] = level === 'L3' ? 'governance-council' : level === 'L2' ? 'queue-lead' : 'reviewer';

      return {
        itemId: input.itemId,
        level,
        routeTo,
        calibratedConfidence: confidence.adjustedConfidence,
        reason: `Escalation ${level} from risk=${Math.round(input.riskScore * 100)}%, blockers=${input.blockerCount}, calibrated=${Math.round(confidence.adjustedConfidence * 100)}%.`,
        requiresHumanDecision: true as const
      };
    })
    .sort((a, b) => a.itemId.localeCompare(b.itemId));
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, Math.round(value * 100) / 100));
}
