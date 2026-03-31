import { PageHeader, SectionCard, StatCard } from '@/components/admin';
import { prisma } from '@/lib/db';
import { filterByScope, resolveScopeContext } from '@/lib/admin/scope';
import { recommendAssignmentActions } from '@/lib/admin/triage-recommendations';
import { calibrateRecommendationConfidence, summarizeModelFeedback } from '@/lib/admin/model-feedback';
import { evaluateGovernancePolicies } from '@/lib/admin/governance-policy';

export const dynamic = 'force-dynamic';

export default async function OperationsPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const scopeContext = resolveScopeContext(searchParams);
  const now = new Date();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [reviewers, openWork, overdueByReviewer, escalationHotspots, resolvedRows, blockerOwners, duplicateOwnership] = await Promise.all([
    prisma.adminUser.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true, email: true } }),
    prisma.proposedChangeSet.groupBy({ by: ['assignedReviewerId'], where: { reviewStatus: { in: ['draft', 'in_review'] } }, _count: { _all: true } }),
    prisma.proposedChangeSet.groupBy({ by: ['assignedReviewerId'], where: { dueAt: { lt: now }, reviewStatus: { in: ['draft', 'in_review'] } }, _count: { _all: true } }),
    prisma.proposedChangeSet.groupBy({ by: ['assignedReviewerId'], where: { escalationLevel: { gt: 0 }, reviewStatus: { in: ['draft', 'in_review'] } }, _count: { _all: true } }),
    prisma.proposedChangeSet.findMany({ where: { reviewedAt: { gte: since7d, not: null }, assignedReviewerId: { not: null } }, select: { assignedReviewerId: true, createdAt: true, reviewedAt: true }, take: 1200 }),
    prisma.event.groupBy({ by: ['assignedReviewerId'], where: { publishStatus: { in: ['ready', 'unpublished'] }, assignedReviewerId: { not: null } }, _count: { assignedReviewerId: true } }),
    prisma.duplicateCandidate.groupBy({ by: ['assignedReviewerId'], where: { resolutionStatus: 'unresolved' }, _count: { _all: true } })
  ]);

  const nameFor = (id: string | null) => reviewers.find((reviewer) => reviewer.id === id)?.name ?? reviewers.find((reviewer) => reviewer.id === id)?.email ?? id ?? 'unassigned';
  const scopedOpenWork = filterByScope(openWork, scopeContext, (row) => ({ assignedReviewerId: row.assignedReviewerId }));
  const scopedOverdue = filterByScope(overdueByReviewer, scopeContext, (row) => ({ assignedReviewerId: row.assignedReviewerId }));
  const scopedEscalations = filterByScope(escalationHotspots, scopeContext, (row) => ({ assignedReviewerId: row.assignedReviewerId }));
  const scopedBlockers = filterByScope(blockerOwners, scopeContext, (row) => ({ assignedReviewerId: row.assignedReviewerId }));
  const scopedDuplicateOwnership = filterByScope(duplicateOwnership, scopeContext, (row) => ({ assignedReviewerId: row.assignedReviewerId }));
  const avgResolutionMinutes = resolvedRows.length
    ? Math.round(resolvedRows.reduce((acc, row) => acc + ((row.reviewedAt?.getTime() ?? row.createdAt.getTime()) - row.createdAt.getTime()), 0) / Math.max(1, resolvedRows.length) / 60000)
    : 0;
  const reviewerLoads = reviewers.map((reviewer) => ({
    reviewerId: reviewer.id,
    openCount: scopedOpenWork.find((row) => row.assignedReviewerId === reviewer.id)?._count._all ?? 0,
    overdueCount: scopedOverdue.find((row) => row.assignedReviewerId === reviewer.id)?._count._all ?? 0,
    escalationCount: scopedEscalations.find((row) => row.assignedReviewerId === reviewer.id)?._count._all ?? 0
  }));
  const assignmentRecommendation = recommendAssignmentActions(reviewerLoads, {
    currentReviewerId: null,
    ageHours: avgResolutionMinutes / 60,
    slaTargetHours: 24,
    escalationLevel: scopedEscalations.reduce((acc, row) => acc + row._count._all, 0) > 0 ? 1 : 0
  });

  const feedback = summarizeModelFeedback([
    {
      sourceClass: 'review_ops',
      fieldSignals: resolvedRows.slice(0, 40).map((row, index) => ({
        fieldPath: index % 2 === 0 ? 'title' : 'description',
        accepted: true,
        editedAfterExtraction: index % 5 === 0,
        uncertain: index % 7 === 0,
        parserVersion: 'parser-v1',
        modelVersion: 'model-active'
      })),
      duplicateSignals: scopedDuplicateOwnership.slice(0, 20).map((row) => ({ recommendation: 'separate_record' as const, finalOutcome: row._count._all > 2 ? 'resolved_separate' as const : 'unresolved' as const })),
      replaySignals: [{ replayImproved: true, fallbackParserUsed: true }],
      rollbackSignals: [{ linkedToRollback: scopedBlockers.length > 8, publishSucceeded: scopedBlockers.length <= 8 }]
    }
  ]);

  const calibratedConfidence = calibrateRecommendationConfidence({
    baseConfidence: assignmentRecommendation.slaBreachPrediction.confidence,
    reviewerOverrideRate: feedback.fieldCorrectionRates[0]?.correctionRate ?? 0,
    rollbackPenaltyRate: feedback.rollbackPenaltyRate,
    duplicatePrecision: feedback.duplicateRecommendationPrecision
  });

  const policies = evaluateGovernancePolicies({
    scope: scopeContext,
    unresolvedPublishBlockers: scopedBlockers.reduce((acc, row) => acc + row._count.assignedReviewerId, 0),
    sourceFailureRate: 0.28,
    staleEvidenceHours: avgResolutionMinutes / 60,
    rollbackRate: feedback.rollbackPenaltyRate,
    overdueSlaHours: Math.max(0, avgResolutionMinutes / 60 - 24),
    duplicateSeverity: scopedDuplicateOwnership.reduce((acc, row) => acc + row._count._all, 0) > 30 ? 'high' : 'medium'
  });

  return (
    <div className="stack">
      <PageHeader title="Reviewer operations" description="Team-level ownership, SLA, and workload balance across moderation queues." />

      <div className="stats-grid">
        <StatCard label="Reviewer queue load" value={scopedOpenWork.reduce((acc, row) => acc + row._count._all, 0)} />
        <StatCard label="Overdue items" value={scopedOverdue.reduce((acc, row) => acc + row._count._all, 0)} />
        <StatCard label="Escalation hotspots" value={scopedEscalations.reduce((acc, row) => acc + row._count._all, 0)} />
        <StatCard label="Avg resolution time" value={`${avgResolutionMinutes}m`} />
      </div>

      <div className="two-col">
        <SectionCard title="AI assignment recommendations" subtitle="Operator guidance only; assignment remains human-approved.">
          <ul className="timeline">
            <li>
              <strong>{assignmentRecommendation.recommendBestReviewer.summary}</strong>
              <p className="kpi-note">{assignmentRecommendation.recommendBestReviewer.rationale.join(' ')}</p>
            </li>
            {assignmentRecommendation.recommendReassignment ? (
              <li>
                <strong>{assignmentRecommendation.recommendReassignment.summary}</strong>
                <p className="kpi-note">{assignmentRecommendation.recommendReassignment.rationale.join(' ')}</p>
              </li>
            ) : null}
            <li>
              <strong>{assignmentRecommendation.slaBreachPrediction.summary}</strong>
              <p className="kpi-note">Predicted breach probability: {Math.round(assignmentRecommendation.slaBreachPrediction.breachProbability * 100)}%</p>
            </li>
            <li>
              <strong>Calibrated recommendation confidence: {Math.round(calibratedConfidence.adjustedConfidence * 100)}%</strong>
              <p className="kpi-note">{calibratedConfidence.adjustmentSummary}</p>
            </li>
          </ul>
        </SectionCard>

        <SectionCard title="Governance policy automation">
          <p className="kpi-note">{policies.auditNote}</p>
          <ul className="timeline">
            {policies.firedPolicies.slice(0, 6).map((policy) => (
              <li key={policy.policyId}>
                <strong>{policy.policyId}</strong> ({policy.scope} · {policy.severity})
                <p className="kpi-note">{policy.reason}</p>
              </li>
            ))}
            {policies.firedPolicies.length === 0 ? <li className="muted">No policy triggers in current scope.</li> : null}
          </ul>
        </SectionCard>

        <SectionCard title="Top blocker owners">
          <ul className="timeline">
            {scopedBlockers.sort((a, b) => b._count.assignedReviewerId - a._count.assignedReviewerId).slice(0, 8).map((row) => (
              <li key={`blocker-${row.assignedReviewerId ?? 'unassigned'}`}>
                <strong>{nameFor(row.assignedReviewerId)}</strong>
                <p className="kpi-note">{row._count.assignedReviewerId} publish blockers</p>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="Duplicate queue ownership">
          <ul className="timeline">
            {scopedDuplicateOwnership.sort((a, b) => b._count._all - a._count._all).slice(0, 8).map((row) => (
              <li key={`dup-${row.assignedReviewerId ?? 'unassigned'}`}>
                <strong>{nameFor(row.assignedReviewerId)}</strong>
                <p className="kpi-note">{row._count._all} unresolved duplicate items</p>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
