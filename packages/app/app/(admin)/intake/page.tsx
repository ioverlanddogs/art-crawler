import Link from 'next/link';
import { EmptyState, IntakeJobStatusBadge, PageHeader, SectionCard } from '@/components/admin';
import { AdminSetupRequired } from '@/components/admin/AdminSetupRequired';
import { prisma } from '@/lib/db';
import { isDatabaseRuntimeReady } from '@/lib/runtime-env';
import { IngestionJobStatus } from '@/lib/prisma-client';
import { IntakePageClient } from './IntakePageClient';
import { filterByScope, resolveScopeContext, withScopeQuery } from '@/lib/admin/scope';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

function truncate(value: string, max = 60) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

export default async function IntakePage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  if (!isDatabaseRuntimeReady()) {
    return <AdminSetupRequired />;
  }

  const scopeContext = resolveScopeContext(searchParams);
  const statusParam = typeof searchParams?.status === 'string' ? searchParams.status : null;
  const status = statusParam && statusParam in IngestionJobStatus ? IngestionJobStatus[statusParam as keyof typeof IngestionJobStatus] : undefined;

  const jobs = await prisma.ingestionJob.findMany({
    where: status ? { status } : undefined,
    take: PAGE_SIZE,
    orderBy: { createdAt: 'desc' },
    include: {
      sourceDocument: {
        select: { sourceUrl: true, sourceType: true }
      }
    }
  });
  const scopedJobs = filterByScope(jobs, scopeContext, (job) => ({ sourceType: job.sourceDocument.sourceType }));

  return (
    <div className="stack">
      <PageHeader title="Intake" description="Submit a URL to ingest and track parsing progress." />

      {/* Status filter tabs */}
      <div className="filters-row">
        {[
          { label: 'All', value: '' },
          { label: 'Needs review', value: 'needs_review' },
          { label: 'Failed', value: 'failed' },
          { label: 'In progress', value: 'fetching' },
          { label: 'Published', value: 'published' }
        ].map(({ label, value }) => (
          <Link
            key={value}
            href={value ? `/intake?status=${value}` : '/intake'}
            className="action-button"
            style={{
              fontSize: 13,
              padding: '4px 12px',
              background: (statusParam ?? '') === value ? 'var(--primary)' : 'var(--surface)',
              color: (statusParam ?? '') === value ? '#fff' : 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              textDecoration: 'none'
            }}
          >
            {label}
          </Link>
        ))}
      </div>

      <SectionCard title="New import">
        <IntakePageClient />
      </SectionCard>

      <SectionCard title="Recent jobs">
        {scopedJobs.length === 0 ? (
          <EmptyState title="No intake jobs yet" description="Submit a URL above to create your first intake job." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Source URL</th>
                  <th scope="col">Status</th>
                  <th scope="col">Started</th>
                  <th scope="col">Completed</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {scopedJobs.map((job) => (
                  <tr key={job.id}>
                    <td title={job.sourceDocument.sourceUrl}>{truncate(job.sourceDocument.sourceUrl)}</td>
                    <td>
                      <IntakeJobStatusBadge status={job.status} />
                    </td>
                    <td>{job.startedAt ? job.startedAt.toLocaleString() : '—'}</td>
                    <td>{job.completedAt ? job.completedAt.toLocaleString() : '—'}</td>
                    <td>
                      <Link href={withScopeQuery(`/intake/${job.id}`, scopeContext.scope)} className="inline-link">
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
