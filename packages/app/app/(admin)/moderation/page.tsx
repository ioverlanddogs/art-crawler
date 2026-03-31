import { PageHeader } from '@/components/admin';
import { prisma } from '@/lib/db';
import { ModerationClient } from './ModerationClient';

export const dynamic = 'force-dynamic';

export default async function ModerationPage({
  searchParams
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const queue = (Array.isArray(searchParams?.queue) ? searchParams?.queue[0] : searchParams?.queue) ?? 'mining';
  const [items, failures, intakeJobs] = await Promise.all([
    prisma.ingestExtractedEvent.findMany({
      where: { status: 'PENDING' },
      orderBy: [{ confidenceScore: 'desc' }, { createdAt: 'desc' }],
      take: 100
    }),
    prisma.pipelineTelemetry.count({ where: { status: 'failure', createdAt: { gte: inLast24Hours() } } }),
    prisma.ingestionJob.findMany({
      where: { status: 'needs_review' },
      include: {
        sourceDocument: {
          select: {
            sourceUrl: true,
            proposedChangeSets: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { id: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    })
  ]);

  const initialItems = items.map((item: any) => ({
    id: item.id,
    title: item.title,
    sourceUrl: item.sourceUrl,
    source: item.source,
    confidenceScore: item.confidenceScore,
    confidenceBand: item.confidenceBand,
    status: item.status,
    importBatchId: item.importBatchId,
    createdAt: item.createdAt.toISOString(),
    autoApproved: item.autoApproved,
    clusterKey: item.clusterKey
  }));

  return (
    <div className="stack">
      <PageHeader
        title="Moderation Queue"
        description="Review imported candidates and decide whether each candidate should advance."
      />
      <div className="filters-row">
        <a className={`action-button ${queue === 'mining' ? 'variant-primary' : 'variant-secondary'}`} href="/moderation?queue=mining">
          Mining imports
        </a>
        <a className={`action-button ${queue === 'intake' ? 'variant-primary' : 'variant-secondary'}`} href="/moderation?queue=intake">
          Intake jobs
        </a>
      </div>

      {queue === 'intake' ? (
        <table className="data-table">
          <thead>
            <tr>
              <th>Job</th>
              <th>Source URL</th>
              <th>Age</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {intakeJobs.map((job) => (
              <tr key={job.id}>
                <td>{job.id}</td>
                <td>
                  <a href={job.sourceDocument.sourceUrl} target="_blank" rel="noreferrer" className="inline-link">
                    {job.sourceDocument.sourceUrl}
                  </a>
                </td>
                <td>{formatAge(job.createdAt)}</td>
                <td>
                  {job.sourceDocument.proposedChangeSets[0]?.id ? (
                    <a href={`/workbench/${job.sourceDocument.proposedChangeSets[0].id}`} className="inline-link">
                      Open workbench
                    </a>
                  ) : (
                    <span className="muted">No change set</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ModerationClient initialItems={initialItems} failureCount={failures} />
      )}
    </div>
  );
}

function inLast24Hours() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

function formatAge(createdAt: Date): string {
  const diffMs = Date.now() - createdAt.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 1) return '<1h';
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
