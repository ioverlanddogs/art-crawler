import Link from 'next/link';

export function InvestigationSearch({
  filters
}: {
  filters: {
    candidateId?: string;
    importBatchId?: string;
    sourceUrl?: string;
    fingerprint?: string;
    stage?: string;
    error?: string;
  };
}) {
  return (
    <form className="investigation-search" method="get" action="/investigations" aria-label="Investigation search filters">
      <label>
        Candidate ID
        <input className="input" name="candidateId" defaultValue={filters.candidateId ?? ''} placeholder="cand_123" />
      </label>
      <label>
        Import batch ID
        <input className="input" name="importBatchId" defaultValue={filters.importBatchId ?? ''} placeholder="batch_456" />
      </label>
      <label>
        Source URL
        <input className="input" name="sourceUrl" defaultValue={filters.sourceUrl ?? ''} placeholder="https://example.com/event" />
      </label>
      <label>
        Fingerprint
        <input className="input" name="fingerprint" defaultValue={filters.fingerprint ?? ''} placeholder="sha256..." />
      </label>
      <label>
        Stage
        <input className="input" name="stage" defaultValue={filters.stage ?? ''} placeholder="extract" />
      </label>
      <label>
        Error text / category
        <input className="input" name="error" defaultValue={filters.error ?? ''} placeholder="timeout / validation" />
      </label>
      <div className="filters-row">
        <button type="submit" className="action-button variant-primary">
          Search trace
        </button>
        <Link className="action-button variant-secondary" href="/investigations">
          Reset filters
        </Link>
      </div>
    </form>
  );
}
