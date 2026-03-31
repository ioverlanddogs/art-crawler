'use client';

import { useMemo, useState } from 'react';
import { analyseBatchUrls, parseUrlLines } from '@/lib/admin/batch-workflows';

type Props = { existingUrls: string[] };

export function BatchIntakeClient({ existingUrls }: Props) {
  const [urlList, setUrlList] = useState('');
  const [sourceLabel, setSourceLabel] = useState('');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high'>('normal');
  const [reviewerId, setReviewerId] = useState('');
  const [dryRun, setDryRun] = useState(true);

  const analysis = useMemo(() => analyseBatchUrls(parseUrlLines(urlList), existingUrls), [urlList, existingUrls]);

  return (
    <div className="stack">
      <label className="stack">
        <span>Paste multiple URLs (newline-separated)</span>
        <textarea value={urlList} onChange={(event) => setUrlList(event.target.value)} rows={8} className="input" placeholder="https://example.com/a\nhttps://example.com/b" />
      </label>

      <label className="stack">
        <span>Upload newline-separated list</span>
        <input
          type="file"
          accept=".txt,.csv"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const text = await file.text();
            setUrlList((current) => [current.trim(), text.trim()].filter(Boolean).join('\n'));
          }}
        />
      </label>

      <div className="filters-row">
        <label className="stack">
          <span>Source label</span>
          <input className="input" value={sourceLabel} onChange={(event) => setSourceLabel(event.target.value)} placeholder="ticket-ops-042" />
        </label>
        <label className="stack">
          <span>Priority</span>
          <select className="input" value={priority} onChange={(event) => setPriority(event.target.value as 'low' | 'normal' | 'high')}>
            <option value="low">low</option>
            <option value="normal">normal</option>
            <option value="high">high</option>
          </select>
        </label>
        <label className="stack">
          <span>Reviewer assignment (optional)</span>
          <input className="input" value={reviewerId} onChange={(event) => setReviewerId(event.target.value)} placeholder="moderator-id" />
        </label>
      </div>

      <label className="filters-row">
        <input type="checkbox" checked={dryRun} onChange={(event) => setDryRun(event.target.checked)} />
        Dry-run validation mode
      </label>

      <p className="muted">Preview only in this sprint: submission wiring follows after operator validation.</p>
      <p className="kpi-note">sourceLabel={sourceLabel || '—'} · priority={priority} · reviewer={reviewerId || '—'} · dryRun={String(dryRun)}</p>

      <div className="stats-grid">
        <article className="card"><h3>Valid URLs</h3><p>{analysis.validUrls.length}</p></article>
        <article className="card"><h3>Duplicate URLs</h3><p>{analysis.duplicateUrls.length}</p></article>
        <article className="card"><h3>Format warnings</h3><p>{analysis.formatWarnings.length}</p></article>
        <article className="card"><h3>Estimated candidate yield</h3><p>{analysis.estimatedCandidateYield}</p></article>
      </div>

      <div className="two-col">
        <article>
          <h3>Duplicate URLs</h3>
          <ul>{analysis.duplicateUrls.map((url) => <li key={`dupe-${url}`}>{url}</li>)}</ul>
        </article>
        <article>
          <h3>Unreachable format warnings</h3>
          <ul>{analysis.formatWarnings.map((url) => <li key={`warn-${url}`}>{url}</li>)}</ul>
        </article>
      </div>
    </div>
  );
}
