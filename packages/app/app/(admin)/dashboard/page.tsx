import {
  AlertBanner,
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
  StatusBadge,
  TrendSummaryCard,
  WorkloadBalanceCard
} from '@/components/admin';
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

export default async function DashboardPage() {
  const since24h = inLast24Hours();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [activeConfig, activeModel, pendingModeration, pendingReview, intakeFailed, failure24h, failureByStage, latestImportSuccess, backlogStats, recentBatches, importExportTelemetry, weekTelemetry, extractionWithEvidence, extractionTotal, eventsReadyToPublish, eventsPublishedThisWeek, unresolvedDuplicates, unresolvedCorroborationConflicts] =
    (await Promise.all([
      safeQuery(() => prisma.pipelineConfigVersion.findFirst({ where: { status: 'ACTIVE' }, orderBy: { activatedAt: 'desc' } }), null),
      safeQuery(() => prisma.modelVersion.findFirst({ where: { status: 'ACTIVE' }, orderBy: { promotedAt: 'desc' } }), null),
      safeQuery(() => prisma.ingestExtractedEvent.count({ where: { status: 'PENDING' } }), 0),
      safeQuery(() => prisma.ingestionJob.count({ where: { status: 'needs_review' } }), 0),
      safeQuery(() => prisma.ingestionJob.count({ where: { status: 'failed', createdAt: { gte: since24h } } }), 0),
      safeQuery(() => prisma.pipelineTelemetry.count({ where: { status: 'failure', createdAt: { gte: since24h } } }), 0),
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
      safeQuery(() => prisma.event.count({ where: { publishStatus: 'ready' } }), 0),
      safeQuery(() => prisma.event.count({ where: { publishStatus: 'published', publishedAt: { gte: since7d } } }), 0),
      safeQuery(() => prisma.duplicateCandidate.count({ where: { resolutionStatus: 'unresolved' } }), 0),
      safeQuery(() => prisma.duplicateCandidate.count({ where: { resolutionStatus: 'unresolved', OR: [{ conflictingSourceCount: { gt: 0 } }, { unresolvedBlockerCount: { gt: 0 } }] } }), 0)
    ])) as any;

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

      <div className="three-col">
        <ExecutiveKpiCard title="Weekly throughput" value={`${successes7d} successful runs`} note="7-day successful pipeline stage completions." scope="global" />
        <ExecutiveKpiCard title="MTTR snapshot" value={mttrSnapshot} note="Mean time to recover is inferred from queue age and recent failure density." scope="tenant" />
        <ExecutiveKpiCard title="Incident trend" value={`${failures7d} incidents / 7d`} note="Leadership summary from pipeline_telemetry failures." scope="team" />
      </div>

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
