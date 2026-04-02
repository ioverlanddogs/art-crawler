'use client';

import { useState } from 'react';

interface SearchResult {
  url: string;
  title: string;
  description: string;
  domain: string;
}

interface InspectResult {
  url: string;
  title: string | null;
  platformType: string | null;
  platformConfidence: string;
  requiresJs: boolean;
  httpStatus?: number;
  extractedTextLength?: number;
  error: string | null;
}

interface IngestResult {
  url: string;
  status: 'queued' | 'error';
  jobId?: string;
  error?: string;
}

export default function VenueDiscoveryClient() {
  const [region, setRegion] = useState('');
  const [maxResults, setMaxResults] = useState(10);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [inspecting, setInspecting] = useState(false);
  const [inspectResults, setInspectResults] = useState<Map<string, InspectResult>>(new Map());
  const [ingesting, setIngesting] = useState(false);
  const [ingestSummary, setIngestSummary] = useState<{
    queued: number;
    errors: number;
    results: IngestResult[];
  } | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!region.trim()) return;
    setSearching(true);
    setSearchError(null);
    setSearchResults([]);
    setSelected(new Set());
    setInspectResults(new Map());
    setIngestSummary(null);

    try {
      const res = await fetch('/api/admin/venues/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ region: region.trim(), maxResults })
      });
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data?.error ?? 'Search failed. Check that a search provider is configured in System settings.');
        return;
      }
      setSearchResults(data.results ?? []);
      if ((data.results ?? []).length === 0) {
        setSearchError('No results returned. Try a different region or check your search provider key.');
      }
    } catch {
      setSearchError('Network error. Please try again.');
    } finally {
      setSearching(false);
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

  function toggleAll() {
    if (selected.size === searchResults.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(searchResults.map((r) => r.url)));
    }
  }

  async function handleInspect() {
    const urls = Array.from(selected);
    if (urls.length === 0 || inspecting) return;
    setInspecting(true);

    const batches: string[][] = [];
    for (let i = 0; i < urls.length; i += 5) {
      batches.push(urls.slice(i, i + 5));
    }

    const newResults = new Map(inspectResults);

    for (const batch of batches) {
      try {
        const res = await fetch('/api/admin/venues/batch-inspect', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ urls: batch })
        });
        const data = await res.json();
        if (res.ok && Array.isArray(data.results)) {
          for (const result of data.results as InspectResult[]) {
            newResults.set(result.url, result);
          }
        }
      } catch {
        // continue with next batch
      }
    }

    setInspectResults(new Map(newResults));
    setInspecting(false);
  }

  async function handleIngest() {
    const urls = Array.from(selected);
    if (urls.length === 0 || ingesting) return;
    setIngesting(true);
    setIngestSummary(null);

    try {
      const res = await fetch('/api/admin/venues/ingest', {
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

  return (
    <div className="stack">
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
            Region or city
          </label>
          <input
            type="text"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="e.g. London, New York, Berlin, Tokyo"
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
          disabled={searching || !region.trim()}
          style={{
            padding: '8px 20px', fontSize: 14, borderRadius: 6, border: 'none',
            background: 'var(--primary)', color: '#fff',
            cursor: searching || !region.trim() ? 'not-allowed' : 'pointer',
            opacity: searching || !region.trim() ? 0.6 : 1
          }}
        >
          {searching ? 'Searching…' : 'Find galleries'}
        </button>
      </form>

      {searchError ? (
        <p role="alert" style={{ color: 'var(--danger)', padding: '10px 14px', background: 'var(--danger-soft)', borderRadius: 6, fontSize: 14 }}>
          {searchError}
        </p>
      ) : null}

      {ingestSummary ? (
        <div style={{ padding: '12px 16px', background: 'var(--success-soft)', borderRadius: 6, fontSize: 14 }}>
          <strong>{ingestSummary.queued} gallery URL{ingestSummary.queued !== 1 ? 's' : ''} queued for intake.</strong>
          {ingestSummary.errors > 0 ? ` ${ingestSummary.errors} failed.` : ''}
          {' '}
          <a href="/intake?sourceType=gallery" style={{ color: 'var(--primary)' }}>
            Monitor intake jobs →
          </a>
        </div>
      ) : null}

      {searchResults.length > 0 ? (
        <section className="section-card">
          <header className="section-card-header">
            <div>
              <h2>Gallery candidates</h2>
              <p>{searchResults.length} results for "{region}"</p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={toggleAll}
                style={{ fontSize: 13, padding: '4px 12px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer' }}
              >
                {selected.size === searchResults.length ? 'Deselect all' : 'Select all'}
              </button>
              <button
                onClick={handleInspect}
                disabled={selected.size === 0 || inspecting}
                style={{
                  fontSize: 13, padding: '4px 12px', borderRadius: 4,
                  border: '1px solid var(--border)', background: 'var(--surface)',
                  cursor: selected.size === 0 || inspecting ? 'not-allowed' : 'pointer',
                  opacity: selected.size === 0 || inspecting ? 0.6 : 1
                }}
              >
                {inspecting ? 'Inspecting…' : `Inspect ${selected.size > 0 ? selected.size : ''} selected`}
              </button>
              <button
                onClick={handleIngest}
                disabled={selected.size === 0 || ingesting}
                style={{
                  fontSize: 13, padding: '4px 14px', borderRadius: 4, border: 'none',
                  background: 'var(--primary)', color: '#fff',
                  cursor: selected.size === 0 || ingesting ? 'not-allowed' : 'pointer',
                  opacity: selected.size === 0 || ingesting ? 0.6 : 1
                }}
              >
                {ingesting ? 'Queuing…' : `Import ${selected.size > 0 ? selected.size : ''} as venues`}
              </button>
            </div>
          </header>

          <div>
            {searchResults.map((result) => {
              const inspect = inspectResults.get(result.url);
              const isSelected = selected.has(result.url);

              return (
                <label
                  key={result.url}
                  style={{
                    display: 'flex', gap: 12, padding: '14px 0',
                    borderTop: '1px solid var(--border)', cursor: 'pointer',
                    alignItems: 'flex-start',
                    background: isSelected ? 'var(--primary-soft)' : 'transparent'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(result.url)}
                    style={{ marginTop: 3, flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 2 }}>
                      <p style={{ fontWeight: 600, fontSize: 14 }}>
                        {inspect?.title ?? result.title ?? result.domain}
                      </p>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{result.domain}</span>
                      {inspect?.platformType && inspect.platformType !== 'unknown' ? (
                        <span style={{
                          fontSize: 11, padding: '1px 6px', borderRadius: 3,
                          background: 'var(--surface-muted)', border: '1px solid var(--border)',
                          color: 'var(--text-muted)'
                        }}>
                          {inspect.platformType}
                        </span>
                      ) : null}
                      {inspect?.requiresJs ? (
                        <span style={{ fontSize: 11, color: 'var(--warning)' }}>⚠ JS</span>
                      ) : null}
                      {inspect?.error ? (
                        <span style={{ fontSize: 11, color: 'var(--danger)' }}>✗ {inspect.error}</span>
                      ) : null}
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {result.url}
                    </p>
                    {result.description ? (
                      <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        {result.description.slice(0, 200)}{result.description.length > 200 ? '…' : ''}
                      </p>
                    ) : null}
                    {inspect && !inspect.error ? (
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                        HTTP {inspect.httpStatus}
                        {inspect.extractedTextLength ? ` · ${Math.round(inspect.extractedTextLength / 100) / 10}KB text` : ''}
                        {' · '}
                        <a href={`/inspect?url=${encodeURIComponent(result.url)}`} style={{ color: 'var(--primary)' }}>
                          Open in inspector →
                        </a>
                      </p>
                    ) : null}
                  </div>
                </label>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
