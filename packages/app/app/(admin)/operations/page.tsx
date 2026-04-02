import Link from 'next/link';
import { DataTable, EmptyState, IntakeJobStatusBadge, PageHeader, SectionCard, StatCard, StatusBadge } from '@/components/admin';
import { AdminSetupRequired } from '@/components/admin/AdminSetupRequired';
import { prisma } from '@/lib/db';
import { isDatabaseRuntimeReady } from '@/lib/runtime-env';

export const dynamic = 'force-dynamic';

export default async function OperationsPage() {
  if (!isDatabaseRuntimeReady()) {
    return <AdminSetupRequired />;
  }

  const [draftChangeSets, failedJobs, needsReviewJobs, recentlyCompleted] = await Promise.all([
    prisma.proposedChangeSet.findMany({
      where: { reviewStatus: 'draft' },
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: {
        sourceDocument: {
          select: {
            sourceUrl: true,
            sourceType: true
          }
        }
      }
    }),
    prisma.ingestionJob.findMany({
      where: { status: 'failed' },
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: {
        sourceDocument: {
          select: {
            sourceUrl: true,
            sourceType: true
          }
        }
      }
    }),
    prisma.ingestionJob.findMany({
      where: { status: 'needs_review' },
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: {
        sourceDocument: {
          select: {
            sourceUrl: true,
            sourceType: true
          }
        }
      }
    }),
    prisma.ingestionJob.findMany({
      where: { status: { in: ['published', 'approved'] } },
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        sourceDocument: {
          select: {
            sourceUrl: true,
            sourceType: true
          }
        }
      }
    })
  ]);

  return (
    <div className="stack">
      <PageHeader title="Review queue" description="Items waiting for your attention." />

      <div className="stats-grid">
        <StatCard label="Awaiting review" value={draftChangeSets.length} />
        <StatCard label="Needs review (intake)" value={needsReviewJobs.length} />
        <StatCard label="Failed jobs" value={failedJobs.length} />
      </div>

      <SectionCard title="Proposed changes awaiting review">
        <DataTable
          rows={draftChangeSets}
          rowKey={(row) => row.id}
          emptyState={<EmptyState title="Nothing to review" description="All change sets have been reviewed." />}
          columns={[
            {
              key: 'url',
              header: 'URL',
              render: (row) => (
                <Link href={`/workbench/${row.id}`} className="inline-link" title={row.sourceDocument.sourceUrl}>
                  {truncate(row.sourceDocument.sourceUrl)}
                </Link>
              )
            },
            { key: 'sourceType', header: 'Source type', render: (row) => row.sourceDocument.sourceType ?? 'unknown' },
            { key: 'createdAt', header: 'Created', render: (row) => row.createdAt.toLocaleString() }
          ]}
        />
      </SectionCard>

      <SectionCard title="Intake jobs — needs review">
        <DataTable
          rows={needsReviewJobs}
          rowKey={(row) => row.id}
          emptyState={<EmptyState title="No jobs awaiting review" description="All recent intake jobs are either in progress or completed." />}
          columns={[
            {
              key: 'url',
              header: 'URL',
              render: (row) => (
                <Link href={`/intake/${row.id}`} className="inline-link" title={row.sourceDocument.sourceUrl}>
                  {truncate(row.sourceDocument.sourceUrl)}
                </Link>
              )
            },
            { key: 'status', header: 'Status', render: (row) => <IntakeJobStatusBadge status={row.status} /> },
            { key: 'created', header: 'Created', render: (row) => row.createdAt.toLocaleString() }
          ]}
        />
      </SectionCard>

      <SectionCard title="Failed intake jobs">
        <DataTable
          rows={failedJobs}
          rowKey={(row) => row.id}
          emptyState={<EmptyState title="No failed jobs" description="All recent intake jobs completed successfully." />}
          columns={[
            {
              key: 'url',
              header: 'URL',
              render: (row) => (
                <Link href={`/intake/${row.id}`} className="inline-link" title={row.sourceDocument.sourceUrl}>
                  {truncate(row.sourceDocument.sourceUrl)}
                </Link>
              )
            },
            { key: 'error', header: 'Error code', render: (row) => row.errorCode ?? 'unknown_error' },
            { key: 'created', header: 'Created', render: (row) => row.createdAt.toLocaleString() },
            {
              key: 'rerun',
              header: 'Actions',
              render: (row) => (
                <Link href={`/intake?url=${encodeURIComponent(row.sourceDocument.sourceUrl)}`} className="inline-link">
                  Re-run
                </Link>
              )
            }
          ]}
        />
      </SectionCard>

      <SectionCard title="Recently completed">
        {recentlyCompleted.length === 0 ? (
          <EmptyState title="No recently completed jobs" description="Completed intake jobs will appear here." />
        ) : (
          <ul className="timeline">
            {recentlyCompleted.map((job) => (
              <li key={job.id}>
                <strong title={job.sourceDocument.sourceUrl}>{truncate(job.sourceDocument.sourceUrl)}</strong>{' '}
                <StatusBadge tone="success">{job.status}</StatusBadge>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function truncate(value: string, max = 60) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}
