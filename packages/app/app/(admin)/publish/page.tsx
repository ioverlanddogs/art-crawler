import Link from 'next/link';
import { EmptyState, PageHeader, SectionCard } from '@/components/admin';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function PublishQueuePage() {
  const [readyEvents, recentBatches] = await Promise.all([
    prisma.event.findMany({
      where: { publishStatus: 'ready' },
      include: {
        proposedChangeSets: {
          where: { reviewStatus: 'approved' },
          orderBy: { reviewedAt: 'desc' },
          take: 1,
          select: {
            reviewedByUserId: true,
            reviewedAt: true
          }
        }
      },
      orderBy: { updatedAt: 'desc' },
      take: 100
    }),
    prisma.publishBatch.findMany({
      orderBy: { publishedAt: 'desc' },
      take: 10
    })
  ]);

  return (
    <div className="stack">
      <PageHeader title="Publish queue" description="Records approved and ready for public release." />

      <SectionCard title="Ready to publish">
        {readyEvents.length === 0 ? (
          <EmptyState title="No events are ready" description="Approved records will appear here once they pass readiness checks." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Title</th>
                  <th scope="col">Change type</th>
                  <th scope="col">Reviewer</th>
                  <th scope="col">Ready since</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {readyEvents.map((event) => {
                  const latest = event.proposedChangeSets[0] ?? null;
                  return (
                    <tr key={event.id}>
                      <td>{event.title}</td>
                      <td>{event.sourceUrl ? 'updated' : 'created'}</td>
                      <td>{latest?.reviewedByUserId ?? '—'}</td>
                      <td>{latest?.reviewedAt ? latest.reviewedAt.toLocaleString() : event.updatedAt.toLocaleString()}</td>
                      <td>
                        <Link href={`/publish/${event.id}`} className="action-button variant-primary">
                          Publish
                        </Link>
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
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
