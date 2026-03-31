import Link from 'next/link';
import { EmptyState, PageHeader, SectionCard } from '@/components/admin';
import { AssignmentControls } from '@/components/admin/AssignmentControls';
import { prisma } from '@/lib/db';
import { groupByKey } from '@/lib/admin/batch-workflows';
import { checkPublishReadiness } from '@/lib/intake/publish-gate';
import { filterByScope, resolveScopeContext, withScopeQuery } from '@/lib/admin/scope';

export const dynamic = 'force-dynamic';

export default async function PublishQueuePage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const scopeContext = resolveScopeContext(searchParams);
  const [events, recentBatches, reviewers] = await Promise.all([
    prisma.event.findMany({
      where: { publishStatus: { in: ['ready', 'draft'] } },
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
  const blocked = scopedEvents
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
      return { event, readiness };
    })
    .filter((row) => !row.readiness.ready);

  const blockerClusters = groupByKey(blocked, (row) => row.readiness.blockers[0] ?? 'unknown blocker');

  return (
    <div className="stack">
      <PageHeader title="Publish queue" description="Explicit release governance with reversible history." />

      <SectionCard title="Batch publish triage" subtitle="Grouped ready records, grouped blocked records, and blocker clustering.">
        <div className="stats-grid">
          <article className="card"><h3>Grouped ready records</h3><p>{readyEvents.length}</p></article>
          <article className="card"><h3>Grouped blocked records</h3><p>{blocked.length}</p></article>
          <article className="card"><h3>Blocker clusters</h3><p>{blockerClusters.length}</p></article>
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
          <article className="stack">
            <h3>Batch release notes</h3>
            <textarea className="input" rows={5} defaultValue={'Batch publish summary:\n- Scope:\n- Risk checks:\n- Rollback plan:'} />
            <button className="action-button variant-primary" type="button">Grouped publish confirmation</button>
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
                  <th scope="col">Reviewer</th>
                  <th scope="col">Ready since</th>
                  <th scope="col">Release governance</th>
                </tr>
              </thead>
              <tbody>
                {readyEvents.map((event) => {
                  const latest = event.proposedChangeSets[0] ?? null;
                  return (
                    <tr key={event.id}>
                      <td>{event.title}</td>
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
        {blocked.length === 0 ? (
          <p className="muted">No publish blockers currently.</p>
        ) : (
          <table className="data-table">
            <thead><tr><th>Event</th><th>Primary blocker</th><th>Owner</th><th>Aging</th><th>Actions</th></tr></thead>
            <tbody>
              {blocked.slice(0, 120).map((row) => (
                <tr key={row.event.id}>
                  <td>{row.event.title}</td>
                  <td>{row.readiness.blockers[0] ?? 'unknown blocker'}</td>
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
