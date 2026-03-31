import type { ScopeContext } from '@/lib/admin/scope';

export type GovernancePolicyId =
  | 'publish_gate_blocker_enforcement'
  | 'source_quarantine_threshold'
  | 'stale_evidence_guard'
  | 'rollback_instability_watch'
  | 'sla_auto_escalation'
  | 'duplicate_severity_route';

export interface GovernancePolicyInput {
  scope: ScopeContext;
  actorId?: string | null;
  unresolvedPublishBlockers: number;
  sourceFailureRate: number;
  staleEvidenceHours: number;
  rollbackRate: number;
  overdueSlaHours: number;
  duplicateSeverity: 'low' | 'medium' | 'high' | 'critical';
  overrideByAdmin?: boolean;
}

export interface FiredPolicy {
  policyId: GovernancePolicyId;
  severity: 'low' | 'medium' | 'high' | 'critical';
  reason: string;
  action: 'recommend' | 'auto_escalate' | 'auto_label_risk' | 'auto_route' | 'auto_quarantine';
  blockedActions: Array<'auto_publish' | 'auto_merge_canonical' | 'bypass_duplicate_blockers' | 'bypass_publish_blockers'>;
  overrideApplied: boolean;
  scope: ScopeContext['scope'];
}

export interface GovernanceEvaluationResult {
  firedPolicies: FiredPolicy[];
  allowAutoPublish: false;
  allowAutoCanonicalMerge: false;
  auditNote: string;
}

const SCOPE_OVERRIDES: Record<ScopeContext['scope'], { staleThreshold: number; slaEscalation: number; quarantineFailureRate: number }> = {
  global: { staleThreshold: 72, slaEscalation: 24, quarantineFailureRate: 0.5 },
  team: { staleThreshold: 64, slaEscalation: 20, quarantineFailureRate: 0.45 },
  workspace: { staleThreshold: 56, slaEscalation: 18, quarantineFailureRate: 0.4 },
  'source-group': { staleThreshold: 48, slaEscalation: 16, quarantineFailureRate: 0.35 },
  'reviewer-owned': { staleThreshold: 72, slaEscalation: 12, quarantineFailureRate: 0.5 }
};

export function evaluateGovernancePolicies(input: GovernancePolicyInput): GovernanceEvaluationResult {
  const thresholds = SCOPE_OVERRIDES[input.scope.scope];
  const firedPolicies: FiredPolicy[] = [];

  if (input.unresolvedPublishBlockers > 0) {
    firedPolicies.push(buildPolicy(input, 'publish_gate_blocker_enforcement', 'critical', `Publish blockers unresolved: ${input.unresolvedPublishBlockers}.`, 'auto_label_risk'));
  }

  if (input.sourceFailureRate >= thresholds.quarantineFailureRate) {
    firedPolicies.push(
      buildPolicy(
        input,
        'source_quarantine_threshold',
        input.sourceFailureRate > 0.7 ? 'critical' : 'high',
        `Source failure rate ${Math.round(input.sourceFailureRate * 100)}% exceeds ${Math.round(thresholds.quarantineFailureRate * 100)}% threshold.`,
        'auto_quarantine'
      )
    );
  }

  if (input.staleEvidenceHours >= thresholds.staleThreshold) {
    firedPolicies.push(
      buildPolicy(
        input,
        'stale_evidence_guard',
        input.staleEvidenceHours > thresholds.staleThreshold * 1.5 ? 'high' : 'medium',
        `Evidence age ${Math.round(input.staleEvidenceHours)}h breached ${thresholds.staleThreshold}h scope threshold.`,
        'auto_route'
      )
    );
  }

  if (input.rollbackRate >= 0.2) {
    firedPolicies.push(
      buildPolicy(
        input,
        'rollback_instability_watch',
        input.rollbackRate >= 0.35 ? 'critical' : 'high',
        `Rollback instability at ${Math.round(input.rollbackRate * 100)}%.`,
        'recommend'
      )
    );
  }

  if (input.overdueSlaHours >= thresholds.slaEscalation) {
    firedPolicies.push(
      buildPolicy(
        input,
        'sla_auto_escalation',
        input.overdueSlaHours >= thresholds.slaEscalation * 2 ? 'high' : 'medium',
        `Overdue SLA ${Math.round(input.overdueSlaHours)}h exceeds ${thresholds.slaEscalation}h escalation threshold.`,
        'auto_escalate'
      )
    );
  }

  if (input.duplicateSeverity === 'high' || input.duplicateSeverity === 'critical') {
    firedPolicies.push(
      buildPolicy(
        input,
        'duplicate_severity_route',
        input.duplicateSeverity,
        `Duplicate severity is ${input.duplicateSeverity}; route to dedicated duplicate workflow.`,
        'auto_route'
      )
    );
  }

  return {
    firedPolicies,
    allowAutoPublish: false,
    allowAutoCanonicalMerge: false,
    auditNote: 'Policy evaluation is deterministic and assistive; high-trust actions remain human-approved and auditable.'
  };
}

function buildPolicy(
  input: GovernancePolicyInput,
  policyId: GovernancePolicyId,
  severity: FiredPolicy['severity'],
  reason: string,
  action: FiredPolicy['action']
): FiredPolicy {
  return {
    policyId,
    severity,
    reason,
    action,
    blockedActions: ['auto_publish', 'auto_merge_canonical', 'bypass_duplicate_blockers', 'bypass_publish_blockers'],
    overrideApplied: Boolean(input.overrideByAdmin),
    scope: input.scope.scope
  };
}
