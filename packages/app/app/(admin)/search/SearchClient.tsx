'use client';

import { useState } from 'react';

interface SearchResult {
  url: string;
  title: string;
  description: string;
  domain: string;
}

interface IngestResult {
  url: string;
  status: 'queued' | 'error';
  jobId?: string;
  error?: string;
}

export default function SearchClient() {
  const [query, setQuery] = useState('');
  const [maxResults, setMaxResults] = useState(10);
  const [searching, setSearching] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [provider, setProvider] = useState<string>('');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [ingestSummary, setIngestSummary] = useState<{
    queued: number;
    errors: number;
    results: IngestResult[];
  } | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setSearchError(null);
    setResults([]);
    setSelected(new Set());
    setIngestSummary(null);

    try {
      const res = await fetch('/api/admin/search/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), maxResults })
      });
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data?.error ?? 'Search failed. Check that a search provider is configured in System settings.');
        return;
      }
      setResults(data.results ?? []);
      setProvider(data.provider ?? '');
      if ((data.results ?? []).length === 0) {
        setSearchError('No results returned. Try a different query or check your search provider key.');
      }
    } catch {
      setSearchError('Network error. Please try again.');
    } finally {
      setSearching(false);
    }
  }

  async function handleIngest() {
    const urls = Array.from(selected);
    if (urls.length === 0) return;
    setIngesting(true);
    setIngestSummary(null);
    try {
      const res = await fetch('/api/admin/search/ingest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ urls })
      });
      const data = await res.json();
      setIngestSummary(data);
      setSelected(new Set());
    } catch {
      setSearchError('Ingest failed. Please try again.');
    } finally {
      setIngesting(false);
    }
  }

  function toggleAll() {
    if (selected.size === results.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(results.map((r) => r.url)));
    }
  }

  function toggle(url: string) {
    const next = new Set(selected);
    if (next.has(url)) {
      next.delete(url);
    } else {
      next.add(url);
    }
    setSelected(next);
  }

  return (
    <div className="stack">
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
            Search query
          </label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. contemporary art exhibitions London 2025"
            style={{ width: '100%', padding: '8px 12px', fontSize: 14, borderRadius: 6, border: '1px solid var(--border)' }}
            disabled={searching}
          />
        </div>
        <div style={{ minWidth: 100 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
            Max results
          </label>
          <input
            type="number"
            min={1}
            max={20}
            value={maxResults}
            onChange={(e) => setMaxResults(Number(e.target.value))}
            style={{ width: '100%', padding: '8px 12px', fontSize: 14, borderRadius: 6, border: '1px solid var(--border)' }}
            disabled={searching}
          />
        </div>
        <button
          type="submit"
          disabled={searching || !query.trim()}
          style={{
            padding: '8px 20px',
            fontSize: 14,
            borderRadius: 6,
            border: 'none',
            background: 'var(--primary)',
            color: '#fff',
            cursor: searching || !query.trim() ? 'not-allowed' : 'pointer',
            opacity: searching || !query.trim() ? 0.6 : 1
          }}
        >
          {searching ? 'Searching…' : 'Search'}
        </button>
      </form>

      {searchError ? (
        <p role="alert" style={{ color: 'var(--danger)', fontSize: 14, padding: '10px 14px', background: 'var(--danger-soft)', borderRadius: 6 }}>
          {searchError}
        </p>
      ) : null}

      {ingestSummary ? (
        <div style={{ padding: '12px 16px', background: 'var(--success-soft)', borderRadius: 6, fontSize: 14 }}>
          <strong>{ingestSummary.queued} URL{ingestSummary.queued !== 1 ? 's' : ''} queued for intake.</strong>
          {ingestSummary.errors > 0 ? ` ${ingestSummary.errors} failed.` : ''}{' '}
          <a href="/intake" style={{ color: 'var(--primary)' }}>View intake queue →</a>
        </div>
      ) : null}

      {results.length > 0 ? (
        <section className="section-card">
          <header className="section-card-header">
            <div>
              <h2>Results</h2>
              <p>{results.length} result{results.length !== 1 ? 's' : ''} from {provider}</p>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button
                onClick={toggleAll}
                style={{ fontSize: 13, padding: '4px 12px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer' }}
              >
                {selected.size === results.length ? 'Deselect all' : 'Select all'}
              </button>
              <button
                onClick={handleIngest}
                disabled={selected.size === 0 || ingesting}
                style={{
                  fontSize: 13,
                  padding: '4px 14px',
                  borderRadius: 4,
                  border: 'none',
                  background: 'var(--primary)',
                  color: '#fff',
                  cursor: selected.size === 0 || ingesting ? 'not-allowed' : 'pointer',
                  opacity: selected.size === 0 || ingesting ? 0.6 : 1
                }}
              >
                {ingesting ? 'Queuing…' : `Push ${selected.size > 0 ? selected.size : ''} to intake`}
              </button>
            </div>
          </header>
          <div>
            {results.map((result) => (
              <label
                key={result.url}
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: '12px 0',
                  borderTop: '1px solid var(--border)',
                  cursor: 'pointer',
                  alignItems: 'flex-start'
                }}
              >
                <input
                  type="checkbox"
                  checked={selected.has(result.url)}
                  onChange={() => toggle(result.url)}
                  style={{ marginTop: 3, flexShrink: 0 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 500, fontSize: 14, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {result.title || result.domain}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {result.url}
                  </p>
                  {result.description ? (
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                      {result.description.slice(0, 180)}{result.description.length > 180 ? '…' : ''}
                    </p>
                  ) : null}
                </div>
              </label>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
