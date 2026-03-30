import Link from 'next/link';
import { EmptyState } from './EmptyState';
import { StatusBadge } from './StatusBadge';

export type InvestigationSummaryData = {
  candidateId?: string;
  importBatchId?: string;
  sourceUrl?: string | null;
  fingerprint?: string | null;
  status?: string;
  confidenceScore?: number;
  configVersion?: number | null;
  modelVersion?: string | null;
  failureCount: number;
  retryCount: number;
  conflictOrRejectCount: number;
};

export function InvestigationSummary({ summary }: { summary: InvestigationSummaryData | null }) {
  if (!summary) {
    return <EmptyState title="No matching object" description="Use filters to locate a candidate, batch, or failure trail." />;
  }

  return (
    <div className="stack">
      <div className="three-col">
        <article className="stat-card">
          <p className="stat-label">Candidate</p>
          <p className="stat-value" style={{ fontSize: '1rem' }}>{summary.candidateId ?? '—'}</p>
          {summary.status ? <StatusBadge tone={summary.status === 'REJECTED' ? 'danger' : summary.status === 'PENDING' ? 'warning' : 'success'}>{summary.status}</StatusBadge> : null}
        </article>
        <article className="stat-card">
          <p className="stat-label">Import batch</p>
          <p className="stat-value" style={{ fontSize: '1rem' }}>{summary.importBatchId ?? '—'}</p>
          <p className="stat-detail">Config v{summary.configVersion ?? '—'} · Model {summary.modelVersion ?? '—'}</p>
        </article>
        <article className="stat-card">
          <p className="stat-label">Trace context</p>
          <p className="stat-detail">Failures: {summary.failureCount}</p>
          <p className="stat-detail">Retries: {summary.retryCount}</p>
          <p className="stat-detail">Conflicts / rejects: {summary.conflictOrRejectCount}</p>
        </article>
      </div>
      {summary.sourceUrl ? (
        <p className="muted">
          Source URL:{' '}
          <a href={summary.sourceUrl} target="_blank" rel="noreferrer" className="inline-link">
            {summary.sourceUrl}
          </a>
        </p>
      ) : null}
      {summary.fingerprint ? <p className="muted">Fingerprint: {summary.fingerprint}</p> : null}
      {summary.importBatchId ? (
        <p className="kpi-note">
          <Link className="inline-link" href={`/pipeline?importBatchId=${encodeURIComponent(summary.importBatchId)}`}>
            Open matching batch on Pipeline view
          </Link>
        </p>
      ) : null}
    </div>
  );
}
