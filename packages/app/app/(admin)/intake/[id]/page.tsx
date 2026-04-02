import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EmptyState, IntakeJobStatusBadge, PageHeader, SectionCard, StatusBadge } from '@/components/admin';
import { AdminSetupRequired } from '@/components/admin/AdminSetupRequired';
import { prisma } from '@/lib/db';
import { isDatabaseRuntimeReady } from '@/lib/runtime-env';
import { IngestionJobStatus } from '@/lib/prisma-client';
import { IntakeRetryAction } from '../IntakePageClient';

export const dynamic = 'force-dynamic';

const STATUS_ORDER: IngestionJobStatus[] = ['queued', 'fetching', 'extracting', 'parsing', 'matching', 'needs_review', 'approved', 'publishing', 'published', 'failed'];

export default async function IntakeJobDetailPage({ params }: { params: { id: string } }) {
  if (!isDatabaseRuntimeReady()) {
    return <AdminSetupRequired />;
  }

  const job = await prisma.ingestionJob.findUnique({
    where: { id: params.id },
    include: {
      sourceDocument: true
    }
  });

  if (!job) {
    notFound();
  }

  const [extractionRun, proposedChangeSet, ingestionLogs] = await Promise.all([
    prisma.extractionRun.findFirst({
      where: { sourceDocumentId: job.sourceDocumentId },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.proposedChangeSet.findFirst({
      where: { sourceDocumentId: job.sourceDocumentId },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.ingestionLog.findMany({
      where: { ingestionJobId: params.id },
      orderBy: { createdAt: 'asc' }
    })
  ]);

  const extractedFields = extractionRun?.extractedFieldsJson && typeof extractionRun.extractedFieldsJson === 'object' && !Array.isArray(extractionRun.extractedFieldsJson) ? extractionRun.extractedFieldsJson : null;

  return (
    <div className="stack">
      <PageHeader title="Import job" description={job.sourceDocument.sourceUrl} />

      <SectionCard title="Status timeline">
        <div className="filters-row" style={{ flexWrap: 'wrap' }}>
          {STATUS_ORDER.map((status) => {
            const tone = status === 'failed' ? 'danger' : status === job.status ? 'info' : 'neutral';
            return (
              <StatusBadge key={status} tone={tone}>
                {status}
              </StatusBadge>
            );
          })}
        </div>
      </SectionCard>


      <SectionCard title="Pipeline log" subtitle="Structured log of every stage for this intake run.">
        {ingestionLogs.length === 0 ? (
          <p className="muted" style={{ padding: '8px 0' }}>
            No log entries yet. Log entries are written by runs after this feature was deployed.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {ingestionLogs.map((entry) => (
              <div
                key={entry.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '90px 80px 1fr auto',
                  gap: 12,
                  padding: '10px 0',
                  borderBottom: '1px solid var(--border)',
                  alignItems: 'start',
                  fontSize: 13
                }}
              >
                <span style={{ fontWeight: 500 }}>{entry.stage}</span>
                <StatusBadge
                  tone={
                    entry.status === 'success'
                      ? 'success'
                      : entry.status === 'failure'
                        ? 'danger'
                        : entry.status === 'warning'
                          ? 'warning'
                          : 'neutral'
                  }
                >
                  {entry.status}
                </StatusBadge>
                <span style={{ color: 'var(--text)' }}>{entry.message}</span>
                <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 12 }}>
                  {new Date(entry.createdAt).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <div className="two-col">
        <SectionCard title="Fetch summary">
          <table className="data-table">
            <tbody>
              <tr>
                <th scope="row">Status</th>
                <td>
                  <IntakeJobStatusBadge status={job.status} />
                </td>
              </tr>
              <tr>
                <th scope="row">HTTP status</th>
                <td>{job.sourceDocument.httpStatus ?? '—'}</td>
              </tr>
              <tr>
                <th scope="row">Content type</th>
                <td>{job.sourceDocument.metadataJson && typeof job.sourceDocument.metadataJson === 'object' && 'contentType' in job.sourceDocument.metadataJson ? String(job.sourceDocument.metadataJson.contentType) : '—'}</td>
              </tr>
              <tr>
                <th scope="row">Fetched at</th>
                <td>{job.sourceDocument.fetchedAt ? job.sourceDocument.fetchedAt.toLocaleString() : '—'}</td>
              </tr>
              <tr>
                <th scope="row">Final URL</th>
                <td>{job.sourceDocument.sourceUrl}</td>
              </tr>
              <tr>
                <th scope="row">Fingerprint</th>
                <td>{job.sourceDocument.fingerprint ?? '—'}</td>
              </tr>
            </tbody>
          </table>
          {job.errorMessage ? <p className="dialog-error">{job.errorMessage}</p> : null}
        </SectionCard>

        <SectionCard title="Extraction preview">
          {extractionRun && extractedFields ? (
            <div className="stack">
              <p className="kpi-note">
                modelVersion: {extractionRun.modelVersion ?? '—'} · parserVersion: {extractionRun.parserVersion ?? '—'}
              </p>
              <table className="data-table">
                <tbody>
                  {Object.entries(extractedFields)
                    .slice(0, 5)
                    .map(([key, value]) => (
                      <tr key={key}>
                        <th scope="row">{key}</th>
                        <td>{typeof value === 'string' ? value : JSON.stringify(value)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No extraction run yet" description="Extraction results will appear here once parsing completes." />
          )}
        </SectionCard>
      </div>

      <SectionCard title="Next step">
        {job.status === 'needs_review' ? (
          proposedChangeSet ? (
            <Link href={`/workbench/${proposedChangeSet.id}`} className="action-button variant-primary">
              Open review workbench
            </Link>
          ) : (
            <p className="muted">Waiting for proposed change set before review can begin.</p>
          )
        ) : null}

        {job.status === 'failed' ? <IntakeRetryAction id={job.id} /> : null}

        {!['needs_review', 'failed'].includes(job.status) ? <p className="muted">Current stage: {job.status}</p> : null}
      </SectionCard>
    </div>
  );
}
