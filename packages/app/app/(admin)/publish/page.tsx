import Link from 'next/link';
import { EmptyState, PageHeader, SectionCard } from '@/components/admin';
import { prisma } from '@/lib/db';
import { groupByKey } from '@/lib/admin/batch-workflows';
import { checkPublishReadiness } from '@/lib/intake/publish-gate';

export const dynamic = 'force-dynamic';

export default async function PublishQueuePage() {
  const [events, recentBatches] = await Promise.all([
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
    })
  ]);

  const readyEvents = events.filter((row) => row.publishStatus === 'ready');
  const blocked = events
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
                          <Link href={`/publish/${event.id}`} className="action-button variant-primary">
                            Review + publish
                          </Link>
                          <Link href={`/audit?entityType=Event&entityId=${encodeURIComponent(event.id)}`} className="action-button variant-secondary">
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
