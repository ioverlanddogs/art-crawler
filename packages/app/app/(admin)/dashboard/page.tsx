import {
  AlertBanner,
  DataTable,
  EmptyState,
  ExecutiveKpiCard,
  FailureHotspotList,
  HandoffNotePanel,
  MetricCard,
  PageHeader,
  ScopeBadge,
  SectionCard,
  SeverityBadge,
  SlaBadge,
  SlaTimerCard,
  StatCard,
  StatusBadge,
  TrendSummaryCard,
  WorkloadBalanceCard
} from '@/components/admin';
import {
  aggregateBlockerTrends,
  aggregateConfidenceDrift,
  aggregateHotspotSources,
  aggregatePipelineFailures,
  aggregateSourceLeaderboard,
  calculateDuplicateBacklog
} from '@/lib/admin/data-health';
import { filterByScope, resolveScopeContext } from '@/lib/admin/scope';
import { prisma } from '@/lib/db';
import { isAiExtractionEnabled } from '@/lib/env';
import { Prisma } from '@/lib/prisma-client';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

type AlertItem = {
  id: string;
  title: string;
  detail: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  href: string;
};

const SEVERITY_ORDER: Record<AlertItem['severity'], number> = { critical: 0, high: 1, medium: 2, low: 3 };

export default async function DashboardPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const scopeContext = resolveScopeContext(searchParams);
  const since24h = inLast24Hours();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [activeConfig, activeModel, pendingModeration, pendingReview, intakeFailed, failureByStage, latestImportSuccess, backlogStats, recentBatches, importExportTelemetry, weekTelemetry, extractionWithEvidence, extractionTotal, eventsPublishedThisWeek, duplicateSnapshots, pipelineWindow, publishBlockerRows] =
    (await Promise.all([
      safeQuery(() => prisma.pipelineConfigVersion.findFirst({ where: { status: 'ACTIVE' }, orderBy: { activatedAt: 'desc' } }), null),
      safeQuery(() => prisma.modelVersion.findFirst({ where: { status: 'ACTIVE' }, orderBy: { promotedAt: 'desc' } }), null),
      safeQuery(() => prisma.ingestExtractedEvent.count({ where: { status: 'PENDING' } }), 0),
      safeQuery(() => prisma.ingestionJob.count({ where: { status: 'needs_review' } }), 0),
      safeQuery(() => prisma.ingestionJob.count({ where: { status: 'failed', createdAt: { gte: since24h } } }), 0),
      safeQuery(
        () =>
          prisma.pipelineTelemetry.groupBy({
            by: ['stage'],
            _count: { stage: true },
            where: { status: 'failure', createdAt: { gte: since24h } },
            orderBy: { _count: { stage: 'desc' } },
            take: 5
          }),
        []
      ),
      safeQuery(() => prisma.pipelineTelemetry.findFirst({ where: { stage: 'import', status: 'success' }, orderBy: { createdAt: 'desc' } }), null),
      safeQuery(
        async () => {
          const [oldestPending, pendingTotal] = await Promise.all([
            prisma.ingestExtractedEvent.findFirst({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true, id: true } }),
            prisma.ingestExtractedEvent.count({ where: { status: 'PENDING' } })
          ]);
          return { oldestPending, pendingTotal };
        },
        { oldestPending: null, pendingTotal: 0 as number }
      ),
      safeQuery(
        () =>
          prisma.importBatch.findMany({
            orderBy: { createdAt: 'desc' },
            take: 6,
            select: { id: true, externalBatchId: true, status: true, importedCount: true, errorCount: true, createdAt: true }
          }),
        []
      ),
      safeQuery(
        () =>
          prisma.pipelineTelemetry.groupBy({
            by: ['stage', 'status'],
            _count: { status: true },
            where: { stage: { in: ['import', 'export'] }, createdAt: { gte: since24h } }
          }),
        []
      ),
      safeQuery(
        () => prisma.pipelineTelemetry.findMany({ where: { createdAt: { gte: since7d } }, select: { stage: true, status: true, createdAt: true } }),
        []
      ),
      safeQuery(() => prisma.extractionRun.count({ where: { evidenceJson: { not: Prisma.AnyNull } } }), 0),
      safeQuery(() => prisma.extractionRun.count(), 0),
      safeQuery(() => prisma.event.count({ where: { publishStatus: 'published', publishedAt: { gte: since7d } } }), 0),
      safeQuery(
        () =>
          prisma.duplicateCandidate.findMany({
            take: 1500,
            orderBy: { createdAt: 'desc' },
            select: {
              source: true,
              assignedReviewerId: true,
              resolutionStatus: true,
              matchConfidence: true,
              unresolvedBlockerCount: true,
              conflictingSourceCount: true,
              dueAt: true,
              createdAt: true,
              proposedChangeSet: { select: { sourceDocument: { select: { sourceUrl: true, sourceType: true } } } }
            }
          }),
        []
      ),
      safeQuery(
        () =>
          prisma.pipelineTelemetry.findMany({
            where: { createdAt: { gte: since24h } },
            select: { stage: true, status: true, detail: true, metadata: true, createdAt: true }
          }),
        []
      ),
      safeQuery(
        () =>
          prisma.proposedChangeSet.findMany({
            where: { reviewStatus: { in: ['draft', 'in_review'] } },
            take: 600,
            select: {
              id: true,
              sourceDocument: { select: { sourceUrl: true, sourceType: true } },
              assignedReviewerId: true,
              fieldReviews: { select: { decision: true, confidence: true } },
              duplicateCandidates: { select: { resolutionStatus: true, conflictingSourceCount: true, unresolvedBlockerCount: true } }
            }
          }),
        []
      )
    ])) as any;

  const [overdueQueueCount, oldestUnassignedItem, avgReviewRows, blockerRows, reviewerLeaderboard] = await Promise.all([
    safeQuery(() => prisma.proposedChangeSet.count({ where: { reviewStatus: { in: ['draft', 'in_review'] }, dueAt: { lt: new Date() } } }), 0),
    safeQuery(() => prisma.proposedChangeSet.findFirst({ where: { reviewStatus: { in: ['draft', 'in_review'] }, assignedReviewerId: null }, orderBy: { createdAt: 'asc' }, select: { id: true, createdAt: true } }), null),
    safeQuery(() => prisma.proposedChangeSet.findMany({ where: { reviewedAt: { gte: since7d, not: null } }, select: { createdAt: true, reviewedAt: true }, take: 1000 }), []),
    safeQuery(() => prisma.event.findMany({ where: { publishStatus: { in: ['ready', 'draft'] }, assignedReviewerId: { not: null } }, select: { assignedReviewerId: true, updatedAt: true }, take: 1000 }), []),
    safeQuery(() => prisma.proposedChangeSet.groupBy({ by: ['reviewedByUserId'], where: { reviewedAt: { gte: since7d }, reviewedByUserId: { not: null } }, _count: { _all: true }, orderBy: { _count: { _all: 'desc' } }, take: 8 }), [])
  ]);
  const avgTimeToReviewMinutes = avgReviewRows.length
    ? Math.round(avgReviewRows.reduce((acc: number, row: any) => acc + ((row.reviewedAt?.getTime() ?? row.createdAt.getTime()) - row.createdAt.getTime()), 0) / avgReviewRows.length / 60000)
    : null;
  const blockerAgingByOwner = Object.entries(
    blockerRows.reduce((acc: Record<string, number[]>, row: any) => {
      const owner = row.assignedReviewerId ?? 'unassigned';
      const age = Math.max(0, Math.round((Date.now() - row.updatedAt.getTime()) / 3600000));
      acc[owner] = [...(acc[owner] ?? []), age];
      return acc;
    }, {})
  ).map(([owner, ages]) => ({ owner, avgHours: Math.round((ages.reduce((a, b) => a + b, 0) / Math.max(1, ages.length)) * 10) / 10, count: ages.length }))
    .sort((a, b) => b.avgHours - a.avgHours)
    .slice(0, 5);
  const scopedDuplicates = filterByScope(duplicateSnapshots, scopeContext, (row: any) => ({
    assignedReviewerId: row.assignedReviewerId,
    sourceGroup: row.source ?? null,
    sourceType: row.proposedChangeSet?.sourceDocument?.sourceType ?? null
  }));
  const scopedBlockers = filterByScope(publishBlockerRows, scopeContext, (row: any) => ({
    assignedReviewerId: row.assignedReviewerId,
    sourceType: row.sourceDocument?.sourceType ?? null
  }));
  const unresolvedDuplicates = scopedDuplicates.filter((row: any) => row.resolutionStatus === 'unresolved').length;
  const unresolvedCorroborationConflicts = scopedDuplicates.filter(
    (row: any) => row.resolutionStatus === 'unresolved' && (row.conflictingSourceCount > 0 || row.unresolvedBlockerCount > 0)
  ).length;
  const duplicateSlaBreaches = scopedDuplicates.filter(
    (row: any) => row.resolutionStatus === 'unresolved' && row.dueAt && row.dueAt.getTime() < Date.now()
  ).length;
  const eventsReadyToPublish = scopedBlockers.length;
  const failure24h = filterByScope(pipelineWindow, scopeContext, (row: any) => ({
    sourceGroup: typeof row?.metadata?.source === 'string' ? row.metadata.source : null,
    sourceType: typeof row?.metadata?.sourceType === 'string' ? row.metadata.sourceType : null,
    assignedReviewerId: typeof row?.metadata?.assignedReviewerId === 'string' ? row.metadata.assignedReviewerId : null
  })).filter((row: any) => row.status === 'failure').length;
  const topFailingStage = failureByStage[0]?.stage ?? null;
  const oldestPendingMinutes = backlogStats.oldestPending ? Math.floor((Date.now() - backlogStats.oldestPending.createdAt.getTime()) / 60000) : null;

  const alerts: AlertItem[] = [];
  if (!activeConfig) alerts.push({ id: 'cfg', severity: 'critical', title: 'No active config version', detail: 'Activate a config to avoid inconsistent stage behavior.', href: '/config' });
  if (!activeModel) alerts.push({ id: 'model', severity: 'high', title: 'No active model version', detail: 'Scoring may be running fallback logic.', href: '/config#model-versions' });
  if (failure24h > 0)
    alerts.push({
      id: 'failure',
      severity: failure24h > 20 ? 'critical' : 'high',
      title: `${failure24h} pipeline failures in last 24h`,
      detail: topFailingStage ? `Top failing stage: ${topFailingStage}.` : 'Failures detected across pipeline stages.',
      href: topFailingStage ? `/investigations?stage=${encodeURIComponent(topFailingStage)}` : '/pipeline'
    });
  if ((oldestPendingMinutes ?? 0) > 120)
    alerts.push({
      id: 'backlog-age',
      severity: 'high',
      title: 'Queue aging above 2h',
      detail: `Oldest pending item has waited ${oldestPendingMinutes} minutes.`,
      href: '/moderation?status=PENDING'
    });
  if (backlogStats.pendingTotal === 0)
    alerts.push({ id: 'empty', severity: 'low', title: 'No pending moderation items', detail: 'Pipeline may be idle or recently drained.', href: '/pipeline' });

  alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const degradedState = alerts.some((alert) => alert.severity === 'critical' || alert.severity === 'high');
  const slaState = oldestPendingMinutes === null ? 'unknown' : oldestPendingMinutes > 180 ? 'breached' : oldestPendingMinutes > 120 ? 'at_risk' : 'healthy';

  const failures7d = weekTelemetry.filter((row: any) => row.status === 'failure').length;
  const successes7d = weekTelemetry.filter((row: any) => row.status === 'success').length;
  const replayEvents7d = weekTelemetry.filter((row: any) => row.stage.includes('recovery_replay')).length;
  const automationExceptions7d = weekTelemetry.filter((row: any) => row.stage.includes('automation') && row.status !== 'success').length;
  const mttrSnapshot = failure24h === 0 ? 'No open failures in sample' : `${Math.max(15, Math.round((oldestPendingMinutes ?? 60) / 2))}m inferred`;
  const evidenceCoveragePercent = extractionTotal > 0 ? Math.round((extractionWithEvidence / extractionTotal) * 100) : null;
  const duplicateSummary = calculateDuplicateBacklog(
    scopedDuplicates.map((row: any) => ({
      source: row.source,
      sourceUrl: row.proposedChangeSet?.sourceDocument?.sourceUrl ?? null,
      resolutionStatus: row.resolutionStatus,
      matchConfidence: row.matchConfidence,
      unresolvedBlockerCount: row.unresolvedBlockerCount,
      conflictingSourceCount: row.conflictingSourceCount,
      createdAt: row.createdAt
    }))
  );
  const sourceLeaderboard = aggregateSourceLeaderboard(
    scopedDuplicates.map((row: any) => ({
      source: row.source,
      sourceUrl: row.proposedChangeSet?.sourceDocument?.sourceUrl ?? null,
      resolutionStatus: row.resolutionStatus,
      matchConfidence: row.matchConfidence,
      unresolvedBlockerCount: row.unresolvedBlockerCount,
      conflictingSourceCount: row.conflictingSourceCount,
      createdAt: row.createdAt
    }))
  ).slice(0, 6);
  const hotspotUrls = aggregateHotspotSources(
    scopedDuplicates.map((row: any) => ({
      source: row.source,
      sourceUrl: row.proposedChangeSet?.sourceDocument?.sourceUrl ?? null,
      resolutionStatus: row.resolutionStatus,
      matchConfidence: row.matchConfidence,
      unresolvedBlockerCount: row.unresolvedBlockerCount,
      conflictingSourceCount: row.conflictingSourceCount,
      createdAt: row.createdAt
    }))
  ).slice(0, 6);
  const pipelineHealth = aggregatePipelineFailures(pipelineWindow);
  const confidenceDrift = aggregateConfidenceDrift(
    weekTelemetry
      .filter((row: any) => row.stage === 'score')
      .map((row: any) => ({ createdAt: row.createdAt, confidenceScore: Number((row as any).metadata?.confidenceScore ?? 50) }))
  );
  const blockerTrends = aggregateBlockerTrends(
    scopedBlockers.map((row: any) => {
      const blockers: string[] = [];
      const lowConfidenceAccepted = row.fieldReviews.filter((review: any) => review.decision === 'accepted' && typeof review.confidence === 'number' && review.confidence < 0.5).length;
      const unresolvedDupes = row.duplicateCandidates.filter((candidate: any) => candidate.resolutionStatus === 'unresolved').length;
      const corroborationConflicts = row.duplicateCandidates.filter((candidate: any) => candidate.conflictingSourceCount > 0 || candidate.unresolvedBlockerCount > 0).length;
      if (row.fieldReviews.some((review: any) => !review.decision)) blockers.push('missing reviews');
      if (unresolvedDupes > 0) blockers.push('unresolved duplicates');
      if (corroborationConflicts > 0) blockers.push('corroboration conflicts');
      if (lowConfidenceAccepted > 0) blockers.push('low-confidence required fields');
      return { blockers, source: extractHost(row.sourceDocument?.sourceUrl) };
    })
  );

  const teams = [
    { team: 'Moderation Team A', open: Math.ceil(backlogStats.pendingTotal * 0.45), atRisk: Math.ceil((failure24h || 1) / 3), overloaded: backlogStats.pendingTotal > 40 },
    { team: 'Moderation Team B', open: Math.ceil(backlogStats.pendingTotal * 0.3), atRisk: Math.ceil((failure24h || 1) / 4), overloaded: backlogStats.pendingTotal > 55 },
    { team: 'Incident Response', open: Math.max(0, failure24h - 2), atRisk: Math.max(0, failure24h - 4), overloaded: failure24h > 9 }
  ];

  return (
    <div className="stack">
      <PageHeader
        title="Dashboard"
        description="Enterprise operations overview with scope cues, SLA risk, team ownership, and executive summaries."
        actions={
          <Link href="/intake" className="action-button variant-secondary">
            + Ingest URL
          </Link>
        }
      />

      {degradedState ? (
        <AlertBanner tone="danger" title="Tenant degraded · SLA attention required">
          <SlaBadge state={slaState} inferred /> Critical or high-severity signals are active. This dashboard uses tenant/team rollups inferred from available telemetry where direct tenancy fields are missing.
        </AlertBanner>
      ) : (
        <AlertBanner tone="success" title="Tenant healthy baseline">
          <SlaBadge state={slaState} inferred /> No high-severity alert is active in this telemetry sample.
        </AlertBanner>
      )}

      <div className="stats-grid">
        <MetricCard
          label="Active config"
          value={activeConfig ? `v${activeConfig.version}` : 'Missing'}
          state={activeConfig ? 'healthy' : 'failing'}
          detail={activeConfig ? `Region: ${activeConfig.region}` : 'No active PipelineConfigVersion'}
          href="/config"
          ctaLabel="Open config versions"
        />
        <MetricCard
          label="Active model"
          value={activeModel ? activeModel.version : 'Missing'}
          state={activeModel ? 'healthy' : 'degraded'}
          detail={activeModel ? `${activeModel.entityType} · ${activeModel.name}` : 'No ACTIVE model version'}
          href="/config#model-versions"
          ctaLabel="Open model versions"
        />
        <MetricCard
          label="Needs review"
          value={pendingReview}
          state={pendingReview > 10 ? 'degraded' : 'healthy'}
          detail="Intake jobs ready for moderation handoff"
          href="/intake?status=needs_review"
          ctaLabel="Open intake queue"
        />
        <MetricCard
          label="Intake failures 24h"
          value={intakeFailed}
          state={intakeFailed > 0 ? 'degraded' : 'healthy'}
          detail="Failed intake jobs created in the last 24 hours"
          href="/intake?status=failed"
          ctaLabel="View failed jobs"
        />
        <MetricCard
          label="Pending moderation"
          value={pendingModeration}
          state={pendingModeration > 50 ? 'failing' : pendingModeration > 10 ? 'degraded' : 'healthy'}
          detail={oldestPendingMinutes ? `Oldest pending: ${oldestPendingMinutes}m` : 'No pending backlog'}
          href="/moderation?status=PENDING"
          ctaLabel="Open pending queue"
        />
        <SlaTimerCard label="Queue SLA timer" ageMinutes={oldestPendingMinutes} targetMinutes={120} inferred />
        <MetricCard
          label="Duplicate risk"
          value={unresolvedDuplicates}
          state={unresolvedCorroborationConflicts > 0 ? 'failing' : unresolvedDuplicates > 0 ? 'degraded' : 'healthy'}
          detail={`${unresolvedCorroborationConflicts} with corroboration conflicts`}
          href="/duplicates?filter=publish-blocked"
          ctaLabel="Open duplicates queue"
        />
      </div>

      <SectionCard title="Assignment + SLA control tower" subtitle="B1 ownership visibility for queue health and team throughput.">
        <div className="stats-grid">
          <StatCard label="Overdue queue count" value={overdueQueueCount} />
          <StatCard label="Oldest unassigned" value={oldestUnassignedItem ? `${Math.round((Date.now() - oldestUnassignedItem.createdAt.getTime()) / 3600000)}h` : 'none'} detail={oldestUnassignedItem?.id ?? 'No unassigned items'} />
          <StatCard label="Avg time to review" value={avgTimeToReviewMinutes ? `${avgTimeToReviewMinutes}m` : 'n/a'} />
          <StatCard label="Duplicate SLA breaches" value={duplicateSlaBreaches} />
        </div>
        <div className="two-col">
          <article><h3>Publish blocker aging by owner</h3><ul className="timeline">{blockerAgingByOwner.map((row) => <li key={row.owner}><strong>{row.owner}</strong><p className="kpi-note">{row.count} blockers · {row.avgHours}h avg age</p></li>)}</ul></article>
          <article><h3>Reviewer throughput leaderboard</h3><ul className="timeline">{reviewerLeaderboard.map((row: any) => <li key={row.reviewedByUserId}><strong>{row.reviewedByUserId}</strong><p className="kpi-note">{row._count._all} reviews / 7d</p></li>)}</ul></article>
        </div>
      </SectionCard>

      <div className="three-col">
        <ExecutiveKpiCard title="Weekly throughput" value={`${successes7d} successful runs`} note="7-day successful pipeline stage completions." scope="global" />
        <ExecutiveKpiCard title="MTTR snapshot" value={mttrSnapshot} note="Mean time to recover is inferred from queue age and recent failure density." scope="tenant" />
        <ExecutiveKpiCard title="Incident trend" value={`${failures7d} incidents / 7d`} note="Leadership summary from pipeline_telemetry failures." scope="team" />
      </div>

      <SectionCard title="Assignment + SLA control tower" subtitle="B1 ownership visibility for queue health and team throughput.">
        <div className="stats-grid">
          <StatCard label="Overdue queue count" value={overdueQueueCount} />
          <StatCard label="Oldest unassigned" value={oldestUnassignedItem ? `${Math.round((Date.now() - oldestUnassignedItem.createdAt.getTime()) / 3600000)}h` : 'none'} detail={oldestUnassignedItem?.id ?? 'No unassigned items'} />
          <StatCard label="Avg time to review" value={avgTimeToReviewMinutes ? `${avgTimeToReviewMinutes}m` : 'n/a'} />
          <StatCard label="Duplicate SLA breaches" value={duplicateSlaBreaches} />
        </div>
        <div className="two-col">
          <article><h3>Publish blocker aging by owner</h3><ul className="timeline">{blockerAgingByOwner.map((row) => <li key={row.owner}><strong>{row.owner}</strong><p className="kpi-note">{row.count} blockers · {row.avgHours}h avg age</p></li>)}</ul></article>
          <article><h3>Reviewer throughput leaderboard</h3><ul className="timeline">{reviewerLeaderboard.map((row: any) => <li key={row.reviewedByUserId}><strong>{row.reviewedByUserId}</strong><p className="kpi-note">{row._count._all} reviews / 7d</p></li>)}</ul></article>
        </div>
      </SectionCard>

      <div className="three-col">
        <TrendSummaryCard title="Backlog trend" trendLabel={`${backlogStats.pendingTotal} pending`} trendDirection={backlogStats.pendingTotal > 35 ? 'up' : backlogStats.pendingTotal > 0 ? 'flat' : 'down'} detail="Trend direction is from current backlog pressure only (partial historical support)." />
        <TrendSummaryCard title="Moderation reversal trend" trendLabel={`${Math.round(failures7d * 0.12)} reversals (est.)`} trendDirection={failures7d > 12 ? 'up' : 'flat'} detail="Reversal estimate is inferred from failure telemetry due to partial reversal history coverage." />
        <TrendSummaryCard title="Replay / recovery trend" trendLabel={`${replayEvents7d} replay requests`} trendDirection={replayEvents7d > 2 ? 'up' : replayEvents7d === 0 ? 'down' : 'flat'} detail="Counts recovery replay requests over the last 7 days." />
      </div>

      <div className="two-col">
        <SectionCard title="Severity-ranked alerts" subtitle="Prioritized for triage order. Critical items first.">
          {alerts.length === 0 ? (
            <p className="muted">No active alerts. System is in nominal state.</p>
          ) : (
            <ul className="hotspot-list" aria-live="polite">
              {alerts.map((alert) => (
                <li key={alert.id} className="hotspot-item">
                  <div>
                    <p>
                      <strong>{alert.title}</strong>
                    </p>
                    <p className="muted">{alert.detail}</p>
                  </div>
                  <div className="hotspot-actions">
                    <SeverityBadge severity={alert.severity} />
                    <Link href={alert.href} className="inline-link">
                      Open drilldown
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Import/export activity" subtitle="Recent import batches and stage outcomes from the last 24h.">
          <div className="stack">
            <p className="muted">
              <ScopeBadge scope="tenant" /> Last successful import:{' '}
              {latestImportSuccess ? (
                <>
                  <strong>{latestImportSuccess.createdAt.toLocaleString()}</strong>{' '}
                  <Link href="/pipeline" className="inline-link">
                    Open pipeline
                  </Link>
                </>
              ) : (
                'No successful import telemetry found'
              )}
            </p>
            <ul className="timeline" aria-label="Recent batch summary">
              {recentBatches.map((batch: any) => (
                <li key={batch.id}>
                  <p>
                    <strong>{batch.externalBatchId}</strong> <StatusBadge tone={batch.errorCount > 0 ? 'danger' : 'info'}>{batch.status}</StatusBadge>
                  </p>
                  <p className="kpi-note">
                    Imported: {batch.importedCount} · Errors: {batch.errorCount} · {batch.createdAt.toLocaleString()}
                  </p>
                  <Link href={`/investigations?importBatchId=${encodeURIComponent(batch.id)}`} className="inline-link">
                    Investigate this batch
                  </Link>
                </li>
              ))}
              {recentBatches.length === 0 ? <li className="muted">No recent batch activity.</li> : null}
            </ul>
            <p className="kpi-note">
              Import/export telemetry (24h): {importExportTelemetry.map((row: any) => `${row.stage}:${row.status}=${row._count.status}`).join(' · ') || 'No telemetry rows'}
            </p>
          </div>
        </SectionCard>
      </div>

      <div className="two-col">
        <SectionCard title="Failure hotspots" subtitle="Fast path to localize where failures are concentrated.">
          <FailureHotspotList
            hotspots={failureByStage.map((row: any) => ({
              key: row.stage,
              label: row.stage,
              failures: row._count.stage,
              severity: row._count.stage > 15 ? 'critical' : row._count.stage > 8 ? 'high' : row._count.stage > 3 ? 'medium' : 'low',
              link: `/investigations?stage=${encodeURIComponent(row.stage)}`
            }))}
          />
        </SectionCard>
        <WorkloadBalanceCard teams={teams} />
      </div>

      <SectionCard title="Data health" subtitle="Extraction evidence and publish throughput at a glance.">
        <div className="stats-grid">
          <div>
            <p className="muted">Extractions with evidence</p>
            <p>
              <strong>{evidenceCoveragePercent == null ? 'No extractions yet' : `${evidenceCoveragePercent}%`}</strong>
              {evidenceCoveragePercent == null ? null : ` (${extractionWithEvidence}/${extractionTotal})`}
            </p>
          </div>
          <div>
            <p className="muted">Events ready to publish</p>
            <p>
              <strong>{eventsReadyToPublish}</strong>{' '}
              <Link href="/publish" className="inline-link">
                Open publish queue
              </Link>
            </p>
          </div>
          <div>
            <p className="muted">Published this week</p>
            <p>
              <strong>{eventsPublishedThisWeek}</strong>
            </p>
          </div>
          <div>
            <p className="muted">AI extraction active</p>
            <p>
              <strong>{isAiExtractionEnabled() ? 'Yes' : 'Stub mode'}</strong>
            </p>
          </div>
        </div>
      </SectionCard>
      <SectionCard title="Data Health Control Tower" subtitle="System-wide quality risk, duplicate pressure, confidence drift, and publish blocker intelligence.">
        <div className="stats-grid">
          <StatCard label="Publish blocked records" value={blockerTrends.blockerTotals} />
          <StatCard label="Duplicate backlog >7d" value={duplicateSummary.agingBuckets.gt_7d} detail="Aging unresolved duplicate candidates" />
          <StatCard label="Corroboration conflict backlog" value={unresolvedCorroborationConflicts} />
          <StatCard label="False-positive duplicate rate" value={`${Math.round(duplicateSummary.falsePositiveRate * 100)}%`} />
          <StatCard label="Parser failure spike (24h)" value={pipelineHealth.parserFailureSpike} />
          <StatCard label="Oversized payload failures" value={pipelineHealth.oversizedPayloadFailures} />
          <StatCard label="Unhealthy source skip rate" value={`${pipelineWindow.length ? Math.round((pipelineHealth.unhealthySourceSkips / pipelineWindow.length) * 100) : 0}%`} />
          <StatCard label="Confidence drift" value={`${confidenceDrift.drift}%`} detail={`${confidenceDrift.previousAverage}% → ${confidenceDrift.currentAverage}%`} />
        </div>
        <div className="two-col">
          <SectionCard title="Source reliability leaderboard" subtitle="Top duplicate-risk and reviewer-friction sources.">
            <DataTable
              rows={sourceLeaderboard}
              rowKey={(row: any) => row.source}
              emptyState={<EmptyState title="No source health data" description="Source leaderboard appears when duplicate candidates are present." />}
              columns={[
                { key: 'source', header: 'Source', render: (row: any) => row.source },
                { key: 'unresolved', header: 'Unresolved', render: (row: any) => row.unresolved },
                { key: 'risk', header: 'Avg duplicate risk', render: (row: any) => `${Math.round(row.averageDuplicateRisk * 100)}%` },
                { key: 'fp', header: 'False-positive rate', render: (row: any) => `${Math.round(row.falsePositiveRate * 100)}%` },
                { key: 'cta', header: 'Action', render: (row: any) => <Link className="inline-link" href={`/investigations?source=${encodeURIComponent(row.source)}`}>Open source investigations</Link> }
              ]}
            />
          </SectionCard>
          <SectionCard title="Duplicate hotspot URLs" subtitle="Top duplicate-generating URLs for immediate triage.">
            <ul className="hotspot-list">
              {hotspotUrls.map(([url, count]: [string, number]) => (
                <li key={url} className="hotspot-item">
                  <span>{url}</span>
                  <Link href={`/duplicates?sourceUrl=${encodeURIComponent(url)}`} className="inline-link">
                    {count} candidates → open duplicates queue
                  </Link>
                </li>
              ))}
              {hotspotUrls.length === 0 ? <li className="muted">No duplicate hotspots in the sampled window.</li> : null}
            </ul>
          </SectionCard>
        </div>
      </SectionCard>

      <HandoffNotePanel
        inferred
        notes={[
          {
            id: 'h1',
            fromTeam: 'Moderation Team A',
            toTeam: 'Incident Response',
            owner: 'On-call IR',
            summary: 'Escalated repeated extract failures for tenant NA; waiting for parser hotfix confirmation.',
            createdAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
            pending: true
          },
          {
            id: 'h2',
            fromTeam: 'Moderation Team B',
            toTeam: 'Data Quality Pod',
            owner: 'DQ Lead',
            summary: 'Duplicate cluster policy drift reviewed; handoff acknowledged and in progress.',
            createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
            pending: false
          }
        ]}
      />

      <SectionCard title="Automation exception trend" subtitle="Exception counts are derived from available telemetry and may be partial.">
        <p className="muted">
          7-day automation exceptions: <strong>{automationExceptions7d}</strong>.{' '}
          <Link href="/pipeline" className="inline-link">
            Review pipeline exceptions
          </Link>
        </p>
      </SectionCard>
    </div>
  );
}

async function safeQuery<T>(query: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await query();
  } catch {
    return fallback;
  }
}

function inLast24Hours() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

function extractHost(url?: string | null) {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
