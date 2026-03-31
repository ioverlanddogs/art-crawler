export const REPLAY_ACTIONS = [
  'replay_ingestion_chain',
  'replay_from_stage',
  'replay_duplicate_compare',
  'replay_parser_extraction_only',
  'replay_normalization_only',
  'replay_publish_readiness_checks',
  'replay_source_health_probe'
] as const;

export const REPLAY_TARGETS = [
  'ingestion_job',
  'source_url',
  'canonical_event',
  'duplicate_candidate',
  'publish_blocker_cluster',
  'rollback_event'
] as const;

export type ReplayAction = (typeof REPLAY_ACTIONS)[number];
export type ReplayTarget = (typeof REPLAY_TARGETS)[number];

export type ReplaySafetyInput = {
  action: ReplayAction;
  targetType: ReplayTarget;
  dryRun: boolean;
  operatorConfirmation?: boolean;
};

export type ReplayFieldDiff = {
  field: string;
  before: string | number | null;
  after: string | number | null;
  changed: boolean;
};

export type ReplayComparison = {
  fieldDiff: ReplayFieldDiff[];
  confidenceDelta: number;
  duplicateRiskDelta: number;
  publishReadinessDelta: number;
  parserDelta: string;
  modelDelta: string;
  sourceHealthDelta: string;
};

export function mapReplayActionToTelemetryStage(action: ReplayAction) {
  const stageByAction: Record<ReplayAction, string> = {
    replay_ingestion_chain: 'replay_ingestion_chain',
    replay_from_stage: 'replay_stage_selected',
    replay_duplicate_compare: 'replay_duplicate_compare',
    replay_parser_extraction_only: 'replay_parser_extraction',
    replay_normalization_only: 'replay_normalization',
    replay_publish_readiness_checks: 'replay_publish_readiness',
    replay_source_health_probe: 'replay_source_health'
  };
  return stageByAction[action];
}

export function enforceReplaySafety(input: ReplaySafetyInput) {
  const safeguards = [
    'Audit continuity is preserved by writing explicit replay telemetry.',
    'Canonical records are never overwritten by replay actions.',
    'Operator confirmation is required before any non-dry-run execution.'
  ];

  if (input.action === 'replay_duplicate_compare') {
    safeguards.push('Duplicate safeguards remain active: replay only produces a comparison artifact.');
  }
  if (input.action === 'replay_publish_readiness_checks' || input.targetType === 'publish_blocker_cluster') {
    safeguards.push('Publish blockers remain enforced and are re-evaluated before any publication action.');
  }

  const requiresOperatorConfirmation = !input.dryRun;
  const confirmed = input.dryRun || input.operatorConfirmation === true;

  return {
    allowCanonicalWrite: false,
    requiresOperatorConfirmation,
    confirmed,
    safeguards
  };
}

export function buildDryRunComparison(args: {
  before: {
    title?: string | null;
    confidenceScore?: number | null;
    duplicateRisk?: number | null;
    publishReadiness?: number | null;
    parserVersion?: string | null;
    modelVersion?: string | null;
    sourceHealth?: string | null;
  };
  simulatedAfter: {
    title?: string | null;
    confidenceScore?: number | null;
    duplicateRisk?: number | null;
    publishReadiness?: number | null;
    parserVersion?: string | null;
    modelVersion?: string | null;
    sourceHealth?: string | null;
  };
}): ReplayComparison {
  const before = args.before;
  const after = args.simulatedAfter;
  const mk = (field: string, b: string | number | null | undefined, a: string | number | null | undefined): ReplayFieldDiff => ({
    field,
    before: b ?? null,
    after: a ?? null,
    changed: (b ?? null) !== (a ?? null)
  });

  return {
    fieldDiff: [
      mk('title', before.title, after.title),
      mk('confidenceScore', before.confidenceScore, after.confidenceScore),
      mk('duplicateRisk', before.duplicateRisk, after.duplicateRisk),
      mk('publishReadiness', before.publishReadiness, after.publishReadiness),
      mk('parserVersion', before.parserVersion, after.parserVersion),
      mk('modelVersion', before.modelVersion, after.modelVersion),
      mk('sourceHealth', before.sourceHealth, after.sourceHealth)
    ],
    confidenceDelta: (after.confidenceScore ?? 0) - (before.confidenceScore ?? 0),
    duplicateRiskDelta: (after.duplicateRisk ?? 0) - (before.duplicateRisk ?? 0),
    publishReadinessDelta: (after.publishReadiness ?? 0) - (before.publishReadiness ?? 0),
    parserDelta: `${before.parserVersion ?? 'unknown'} → ${after.parserVersion ?? 'unknown'}`,
    modelDelta: `${before.modelVersion ?? 'unknown'} → ${after.modelVersion ?? 'unknown'}`,
    sourceHealthDelta: `${before.sourceHealth ?? 'unknown'} → ${after.sourceHealth ?? 'unknown'}`
  };
}
