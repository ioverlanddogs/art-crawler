export type QueueType = 'review' | 'duplicate' | 'replay' | 'publish' | 'recovery';

export interface DispatchPriorityInput {
  queueType: QueueType;
  scopeKey: string;
  ageHours: number;
  slaTargetHours: number;
  escalationLevel: number;
  unresolvedBlockers: number;
  duplicateRisk: number;
  corroborationRisk: number;
}

export interface DispatchPriorityResult {
  priorityScore: number;
  slaPressure: number;
  blockerOverride: boolean;
  reasonCodes: string[];
}

const BASE_QUEUE_WEIGHT: Record<QueueType, number> = {
  review: 30,
  duplicate: 34,
  replay: 18,
  publish: 24,
  recovery: 28
};

export function scoreDispatchPriority(input: DispatchPriorityInput): DispatchPriorityResult {
  const ageRatio = safeRatio(input.ageHours, input.slaTargetHours);
  const slaPressure = clamp01(ageRatio);
  const blockerOverride = input.unresolvedBlockers > 0;

  const queueWeight = BASE_QUEUE_WEIGHT[input.queueType];
  const escalationWeight = clamp(input.escalationLevel, 0, 4) * 8;
  const slaWeight = Math.round(slaPressure * 32);
  const riskWeight = Math.round(clamp01(input.duplicateRisk) * 14 + clamp01(input.corroborationRisk) * 12);
  const blockerWeight = blockerOverride ? 30 : 0;

  const raw = queueWeight + escalationWeight + slaWeight + riskWeight + blockerWeight;
  const priorityScore = clamp(raw, 0, 100);

  const reasonCodes = [
    `scope:${input.scopeKey}`,
    `queue:${input.queueType}`,
    `sla:${Math.round(slaPressure * 100)}%`,
    `escalation:L${clamp(input.escalationLevel, 0, 4)}`
  ];
  if (blockerOverride) reasonCodes.push('blocker:first');

  return { priorityScore, slaPressure, blockerOverride, reasonCodes };
}

function safeRatio(numerator: number, denominator: number) {
  return denominator <= 0 ? 0 : numerator / denominator;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, Math.round(value * 100) / 100));
}
