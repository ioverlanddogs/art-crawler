import { checkPublishReadiness, type ProposedChangeSetWithReviews } from '@/lib/intake/publish-gate';

export type ConfidenceBand = 'low' | 'medium' | 'high';

export interface PublishReadinessInput extends ProposedChangeSetWithReviews {
  extractionCompleteness?: number;
  trustTierScore?: number;
  sourcePerformance?: number;
  rollbackHistoryCount?: number;
  staleEvidenceHours?: number;
  staleSourceHours?: number;
  reviewerUncertainDecisions?: number;
}

export interface PublishReadinessFactor {
  key:
    | 'field_review_completeness'
    | 'duplicate_corroboration'
    | 'confidence_band'
    | 'source_reliability'
    | 'rollback_instability'
    | 'stale_evidence'
    | 'reviewer_certainty';
  label: string;
  contribution: number;
  detail: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface PublishReadinessScore {
  publishReadinessScore: number;
  publishRiskScore: number;
  releaseConfidence: ConfidenceBand;
  rollbackRiskIndicator: 'low' | 'guarded' | 'high';
  dataFreshnessIndicator: 'fresh' | 'aging' | 'stale';
  blockerSeverityBreakdown: Record<'critical' | 'high' | 'medium' | 'low', number>;
  duplicateCorroborationRiskContribution: number;
  reviewerCertaintyContribution: number;
  sourceReliabilityContribution: number;
  factors: PublishReadinessFactor[];
  blockers: string[];
  warnings: string[];
  ready: boolean;
  explanation: string[];
}

export interface ReleaseSimulationResult {
  publishReadyNow: string[];
  blockedNow: string[];
  highRiskButPublishable: string[];
  rollbackProne: string[];
  topRiskyRecords: Array<{ eventId: string; title: string; risk: number; reason: string }>;
}

export function scorePublishReadiness(input: PublishReadinessInput): PublishReadinessScore {
  const gate = checkPublishReadiness(input);
  const proposedData = input.proposedDataJson ?? {};
  const reviewed = input.fieldReviews.filter((review) => review.decision != null).length;
  const reviewCoverage = Object.keys(proposedData).length > 0 ? reviewed / Math.max(1, Object.keys(proposedData).length) : 0;

  const unresolvedDupes = (input.duplicateCandidates ?? []).filter((candidate) => candidate.resolutionStatus === 'unresolved').length;
  const conflictingDupes = (input.duplicateCandidates ?? []).reduce((acc, candidate) => acc + (candidate.conflictingSourceCount > 0 ? 1 : 0), 0);
  const unresolvedBlockers = (input.duplicateCandidates ?? []).reduce((acc, candidate) => acc + (candidate.unresolvedBlockerCount ?? 0), 0);
  const highRiskDupes = unresolvedDupes + conflictingDupes + (unresolvedBlockers > 0 ? 1 : 0);

  const lowConfidenceAccepted = input.fieldReviews.filter(
    (review) => review.decision === 'accepted' && review.confidence != null && review.confidence < 0.5
  ).length;
  const uncertainDecisions = input.reviewerUncertainDecisions ?? lowConfidenceAccepted;
  const extractionCompleteness = clamp(input.extractionCompleteness ?? 0.75, 0, 1);
  const sourcePerformance = clamp(input.sourcePerformance ?? 0.7, 0, 1);
  const trustTierScore = clamp(input.trustTierScore ?? 0.7, 0, 1);
  const staleHours = Math.max(input.staleEvidenceHours ?? 0, input.staleSourceHours ?? 0);
  const rollbackHistoryCount = Math.max(0, input.rollbackHistoryCount ?? 0);

  const confidencePenalty = lowConfidenceAccepted * 8;
  const freshnessPenalty = staleHours > 72 ? 24 : staleHours > 36 ? 14 : staleHours > 24 ? 8 : 0;
  const rollbackPenalty = rollbackHistoryCount >= 2 ? 20 : rollbackHistoryCount === 1 ? 10 : 0;
  const duplicatePenalty = highRiskDupes * 12;
  const coveragePenalty = Math.max(0, Math.round((1 - reviewCoverage) * 25));
  const sourcePenalty = Math.round((1 - ((sourcePerformance + trustTierScore) / 2)) * 20);
  const extractionPenalty = Math.round((1 - extractionCompleteness) * 16);
  const uncertainPenalty = uncertainDecisions * 6;

  const publishRiskScore = clamp(
    duplicatePenalty + freshnessPenalty + rollbackPenalty + confidencePenalty + sourcePenalty + extractionPenalty + uncertainPenalty + coveragePenalty,
    0,
    100
  );
  const publishReadinessScore = clamp(100 - publishRiskScore - gate.blockers.length * 15, 0, 100);

  const factors: PublishReadinessFactor[] = [
    {
      key: 'field_review_completeness',
      label: 'Field review completeness',
      contribution: -coveragePenalty,
      detail: `${Math.round(reviewCoverage * 100)}% reviewed fields; extraction completeness ${Math.round(extractionCompleteness * 100)}%.`,
      severity: coveragePenalty > 14 ? 'high' : coveragePenalty > 7 ? 'medium' : 'low'
    },
    {
      key: 'duplicate_corroboration',
      label: 'Duplicate/corroboration risk',
      contribution: -duplicatePenalty,
      detail: `${unresolvedDupes} unresolved duplicate(s), ${conflictingDupes} conflicting corroboration case(s).`,
      severity: duplicatePenalty >= 24 ? 'critical' : duplicatePenalty >= 12 ? 'high' : 'low'
    },
    {
      key: 'confidence_band',
      label: 'Confidence band pressure',
      contribution: -(confidencePenalty + extractionPenalty),
      detail: `${lowConfidenceAccepted} low-confidence accepted field(s).`,
      severity: confidencePenalty >= 16 ? 'high' : confidencePenalty > 0 ? 'medium' : 'low'
    },
    {
      key: 'source_reliability',
      label: 'Source reliability contribution',
      contribution: -sourcePenalty,
      detail: `Source performance ${Math.round(sourcePerformance * 100)}%, trust tier ${Math.round(trustTierScore * 100)}%.`,
      severity: sourcePenalty >= 12 ? 'high' : sourcePenalty >= 7 ? 'medium' : 'low'
    },
    {
      key: 'rollback_instability',
      label: 'Rollback instability indicator',
      contribution: -rollbackPenalty,
      detail: `${rollbackHistoryCount} rollback-linked publication(s) in sample window.`,
      severity: rollbackPenalty >= 20 ? 'critical' : rollbackPenalty > 0 ? 'medium' : 'low'
    },
    {
      key: 'stale_evidence',
      label: 'Data freshness',
      contribution: -freshnessPenalty,
      detail: staleHours > 0 ? `Evidence/source age ${Math.round(staleHours)}h.` : 'Evidence freshness is within current window.',
      severity: freshnessPenalty >= 20 ? 'critical' : freshnessPenalty >= 10 ? 'high' : freshnessPenalty > 0 ? 'medium' : 'low'
    },
    {
      key: 'reviewer_certainty',
      label: 'Reviewer certainty contribution',
      contribution: -uncertainPenalty,
      detail: `${uncertainDecisions} uncertain reviewer decisions detected.`,
      severity: uncertainPenalty >= 18 ? 'high' : uncertainPenalty > 0 ? 'medium' : 'low'
    }
  ];

  const blockerSeverityBreakdown = summarizeBlockerSeverity(gate.blockers);

  return {
    publishReadinessScore,
    publishRiskScore,
    releaseConfidence: publishRiskScore >= 65 ? 'low' : publishRiskScore >= 35 ? 'medium' : 'high',
    rollbackRiskIndicator: rollbackPenalty >= 20 ? 'high' : rollbackPenalty > 0 ? 'guarded' : 'low',
    dataFreshnessIndicator: staleHours > 72 ? 'stale' : staleHours > 24 ? 'aging' : 'fresh',
    blockerSeverityBreakdown,
    duplicateCorroborationRiskContribution: -duplicatePenalty,
    reviewerCertaintyContribution: -uncertainPenalty,
    sourceReliabilityContribution: -sourcePenalty,
    factors,
    blockers: gate.blockers,
    warnings: gate.warnings,
    ready: gate.ready,
    explanation: [
      gate.ready ? 'All mandatory publish blockers cleared.' : 'One or more hard publish blockers remain unresolved.',
      `Risk ${publishRiskScore}/100 computed from duplicates, confidence, freshness, rollback, and source reliability factors.`,
      'Scoring is advisory; human confirmation is still required before publish.'
    ]
  };
}

export function simulateStagedRelease(
  records: Array<{ eventId: string; title: string; input: PublishReadinessInput }>
): ReleaseSimulationResult {
  const evaluated = records.map((record) => ({ record, score: scorePublishReadiness(record.input) }));

  const publishReadyNow = evaluated.filter((row) => row.score.ready && row.score.publishRiskScore <= 45).map((row) => row.record.eventId);
  const blockedNow = evaluated.filter((row) => !row.score.ready).map((row) => row.record.eventId);
  const highRiskButPublishable = evaluated
    .filter((row) => row.score.ready && row.score.publishRiskScore > 45)
    .map((row) => row.record.eventId);
  const rollbackProne = evaluated
    .filter((row) => row.score.rollbackRiskIndicator === 'high' || row.score.publishRiskScore >= 70)
    .map((row) => row.record.eventId);

  return {
    publishReadyNow,
    blockedNow,
    highRiskButPublishable,
    rollbackProne,
    topRiskyRecords: evaluated
      .sort((a, b) => b.score.publishRiskScore - a.score.publishRiskScore)
      .slice(0, 8)
      .map((row) => ({
        eventId: row.record.eventId,
        title: row.record.title,
        risk: row.score.publishRiskScore,
        reason: row.score.blockers[0] ?? row.score.factors.find((factor) => factor.severity === 'critical')?.detail ?? 'No critical reason logged.'
      }))
  };
}

function summarizeBlockerSeverity(blockers: string[]) {
  const tally = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const blocker of blockers) {
    const lower = blocker.toLowerCase();
    if (lower.includes('duplicate') || lower.includes('corroboration') || lower.includes('conflict')) tally.critical += 1;
    else if (lower.includes('required') || lower.includes('missing')) tally.high += 1;
    else if (lower.includes('review')) tally.medium += 1;
    else tally.low += 1;
  }
  return tally;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value * 100) / 100));
}
