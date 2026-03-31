import Link from 'next/link';
import { EmptyState, PageHeader, SectionCard } from '@/components/admin';
import { AssignmentControls } from '@/components/admin/AssignmentControls';
import { prisma } from '@/lib/db';
import { groupByKey } from '@/lib/admin/batch-workflows';
import { checkPublishReadiness } from '@/lib/intake/publish-gate';
import { filterByScope, resolveScopeContext, withScopeQuery } from '@/lib/admin/scope';
import { recommendAssignmentActions } from '@/lib/admin/triage-recommendations';
import { scorePublishReadiness, simulateStagedRelease } from '@/lib/admin/publish-readiness';

export const dynamic = 'force-dynamic';

export default async function PublishQueuePage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const scopeContext = resolveScopeContext(searchParams);
  const [events, recentBatches, reviewers] = await Promise.all([
    prisma.event.findMany({
      where: { publishStatus: { in: ['ready', 'unpublished'] } },
      include: {
        proposedChangeSets: {
          where: { reviewStatus: 'approved' },
          orderBy: { reviewedAt: 'desc' },
          take: 1,
          include: { fieldReviews: true, duplicateCandidates: true }
        }
      },
      orderBy: { updatedAt: 'desc' },
      take: 200
    }),
    prisma.publishBatch.findMany({
      orderBy: { publishedAt: 'desc' },
      take: 10
    }),
    prisma.adminUser.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true, email: true }, orderBy: { email: 'asc' }, take: 100 })
  ]);

  const scopedEvents = filterByScope(events, scopeContext, (row) => ({
    assignedReviewerId: row.assignedReviewerId,
    workspaceId: row.venueId
  }));
  const readyEvents = scopedEvents.filter((row) => row.publishStatus === 'ready');

  const publishRows = scopedEvents
    .filter((row) => row.publishStatus !== 'published')
    .map((event) => {
      const latest = event.proposedChangeSets[0];
      const readiness = latest
        ? checkPublishReadiness({
            proposedDataJson: asRecord(latest.proposedDataJson),
            fieldReviews: latest.fieldReviews,
            duplicateCandidates: latest.duplicateCandidates
          })
        : { ready: false, blockers: ['No approved change set'], warnings: [] };

      const readinessScore = latest
        ? scorePublishReadiness({
            proposedDataJson: asRecord(latest.proposedDataJson),
            fieldReviews: latest.fieldReviews,
            duplicateCandidates: latest.duplicateCandidates,
            staleEvidenceHours: Math.max(0, (Date.now() - event.updatedAt.getTime()) / 3600000),
            extractionCompleteness: Math.min(1, latest.fieldReviews.length / Math.max(1, Object.keys(asRecord(latest.proposedDataJson)).length)),
            sourcePerformance: 0.72,
            trustTierScore: 0.7
          })
        : scorePublishReadiness({ proposedDataJson: {}, fieldReviews: [], duplicateCandidates: [] });

      return { event, readiness, readinessScore };
    });

  const blocked = publishRows.filter((row) => !row.readiness.ready);
  const blockerClusters = groupByKey(blocked, (row) => row.readiness.blockers[0] ?? 'unknown blocker');

  const releaseSimulation = simulateStagedRelease(
    publishRows.map((row) => ({
      eventId: row.event.id,
      title: row.event.title,
      input: {
        proposedDataJson: asRecord(row.event.proposedChangeSets[0]?.proposedDataJson),
        fieldReviews: row.event.proposedChangeSets[0]?.fieldReviews ?? [],
        duplicateCandidates: row.event.proposedChangeSets[0]?.duplicateCandidates ?? [],
        staleEvidenceHours: Math.max(0, (Date.now() - row.event.updatedAt.getTime()) / 3600000),
        sourcePerformance: 0.72,
        trustTierScore: 0.7
      }
    }))
  );

  const reviewerLoads = reviewers.map((reviewer) => ({
    reviewerId: reviewer.id,
    openCount: blocked.filter((row) => row.event.assignedReviewerId === reviewer.id).length,
    overdueCount: blocked.filter((row) => row.event.assignedReviewerId === reviewer.id && Date.now() - row.event.updatedAt.getTime() > 24 * 3600000).length,
    escalationCount: blocked.filter((row) => row.event.assignedReviewerId === reviewer.id && (row.event.escalationLevel ?? 0) > 0).length
  }));
  const publishBlockerAssignmentRecommendation = recommendAssignmentActions(reviewerLoads, {
    currentReviewerId: null,
    ageHours: blocked.length ? blocked.reduce((acc, row) => acc + (Date.now() - row.event.updatedAt.getTime()) / 3600000, 0) / blocked.length : 0,
    slaTargetHours: 24,
    escalationLevel: blocked.some((row) => (row.event.escalationLevel ?? 0) > 0) ? 1 : 0
  });

  return (
    <div className="stack">
      <PageHeader title="Publish queue" description="Explicit release governance with reversible history." />

      <SectionCard title="Batch publish triage" subtitle="Grouped ready records, grouped blocked records, and blocker clustering.">
        <div className="stats-grid">
          <article className="card"><h3>Grouped ready records</h3><p>{readyEvents.length}</p></article>
          <article className="card"><h3>Grouped blocked records</h3><p>{blocked.length}</p></article>
          <article className="card"><h3>Blocker clusters</h3><p>{blockerClusters.length}</p></article>
          <article className="card"><h3>High-risk publishable</h3><p>{releaseSimulation.highRiskButPublishable.length}</p></article>
        </div>
        <div className="two-col">
          <article>
            <h3>Top blocker clusters</h3>
            <ul className="timeline">
              {blockerClusters.slice(0, 8).map((cluster) => (
                <li key={cluster.key}>
                  <strong>{cluster.key}</strong>
                  <p className="kpi-note">{cluster.count} records</p>
                </li>
              ))}
            </ul>
          </article>
          <article>
            <h3>Staged release simulation (non-destructive)</h3>
            <ul className="timeline">
              <li><strong>Publish-ready now:</strong> {releaseSimulation.publishReadyNow.length}</li>
              <li><strong>Blocked now:</strong> {releaseSimulation.blockedNow.length}</li>
              <li><strong>High-risk but publishable:</strong> {releaseSimulation.highRiskButPublishable.length}</li>
              <li><strong>Likely rollback-prone:</strong> {releaseSimulation.rollbackProne.length}</li>
            </ul>
            <p className="kpi-note">Simulation informs triage only. Human approval and blockers still govern release.</p>
          </article>
        </div>
      </SectionCard>

      <SectionCard title="Ready to publish" subtitle="Each publish action requires a release summary and links into audit trail.">
        <p className="muted">
          Duplicate and corroboration blockers must be resolved before publish.{' '}
          <Link href="/duplicates" className="inline-link">
            Open duplicates queue
          </Link>
          .
        </p>
        {readyEvents.length === 0 ? (
          <EmptyState title="No events are ready" description="Approved records will appear here once they pass readiness checks." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Title</th>
                  <th scope="col">Readiness / risk</th>
                  <th scope="col">Reviewer</th>
                  <th scope="col">Ready since</th>
                  <th scope="col">Release governance</th>
                </tr>
              </thead>
              <tbody>
                {readyEvents.map((event) => {
                  const latest = event.proposedChangeSets[0] ?? null;
                  const score = scorePublishReadiness({
                    proposedDataJson: asRecord(latest?.proposedDataJson),
                    fieldReviews: latest?.fieldReviews ?? [],
                    duplicateCandidates: latest?.duplicateCandidates ?? [],
                    staleEvidenceHours: Math.max(0, (Date.now() - event.updatedAt.getTime()) / 3600000),
                    sourcePerformance: 0.72,
                    trustTierScore: 0.7
                  });
                  return (
                    <tr key={event.id}>
                      <td>{event.title}</td>
                      <td>{score.publishReadinessScore}/100 · risk {score.publishRiskScore}/100 ({score.releaseConfidence})</td>
                      <td>{latest?.reviewedByUserId ?? '—'}</td>
                      <td>{latest?.reviewedAt ? latest.reviewedAt.toLocaleString() : event.updatedAt.toLocaleString()}</td>
                      <td>
                        <div className="filters-row">
                          <Link href={withScopeQuery(`/publish/${event.id}`, scopeContext.scope)} className="action-button variant-primary">
                            Review + publish
                          </Link>
                          <Link href={withScopeQuery(`/audit?entityType=Event&entityId=${encodeURIComponent(event.id)}`, scopeContext.scope)} className="action-button variant-secondary">
                            Audit trail
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Publish blockers ownership" subtitle="Escalate and assign blockers before release windows slip.">
        <p className="kpi-note">{publishBlockerAssignmentRecommendation.recommendBestReviewer.summary} · {publishBlockerAssignmentRecommendation.slaBreachPrediction.summary}</p>
        {blocked.length === 0 ? (
          <p className="muted">No publish blockers currently.</p>
        ) : (
          <table className="data-table">
            <thead><tr><th>Event</th><th>Primary blocker</th><th>Risk</th><th>Owner</th><th>Aging</th><th>Actions</th></tr></thead>
            <tbody>
              {blocked.slice(0, 120).map((row) => (
                <tr key={row.event.id}>
                  <td>{row.event.title}</td>
                  <td>{row.readiness.blockers[0] ?? 'unknown blocker'}</td>
                  <td>{row.readinessScore.publishRiskScore}/100</td>
                  <td>{row.event.assignedReviewerId ?? 'unassigned'} · {row.event.slaState}</td>
                  <td>{Math.max(0, Math.round((Date.now() - row.event.updatedAt.getTime()) / 3600000))}h</td>
                  <td><AssignmentControls endpoint={`/api/admin/publish/blockers/${row.event.id}/assignment`} reviewers={reviewers} currentAssigneeId={row.event.assignedReviewerId} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      <SectionCard title="Recently published">
        {recentBatches.length === 0 ? (
          <p className="muted">No publish batches yet.</p>
        ) : (
          <ul className="timeline">
            {recentBatches.map((batch) => (
              <li key={batch.id}>
                <p>
                  <strong>{batch.id}</strong> · {batch.status}
                </p>
                <p className="kpi-note">{batch.publishedAt ? batch.publishedAt.toLocaleString() : 'Not yet published'}</p>
                <p className="kpi-note">{batch.releaseSummary ?? 'No release summary recorded.'}</p>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
