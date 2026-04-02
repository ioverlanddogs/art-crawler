'use client';

import { useState } from 'react';

const ENRICHMENT_MODES = [
  { value: 'artists', label: 'Artists', hint: 'e.g. /artists or /represented-artists' },
  { value: 'artworks', label: 'Artworks', hint: 'e.g. /works or /collection or /shop' },
  { value: 'events', label: 'Events / What\'s On', hint: 'e.g. /exhibitions or /whats-on' },
  { value: 'gallery', label: 'Gallery info', hint: 'e.g. /about or /visit' },
  { value: 'auto', label: 'Auto-detect', hint: 'Let the AI decide' }
] as const;

interface EnrichResult {
  ingestionJobId: string;
  mode: string;
  url: string;
}

export default function VenueEnrichClient({
  venueId,
  venueName,
  venueDomain,
  venueWebsiteUrl
}: {
  venueId: string;
  venueName: string;
  venueDomain: string | null;
  venueWebsiteUrl: string | null;
}) {
  const [url, setUrl] = useState(venueWebsiteUrl ?? '');
  const [mode, setMode] = useState<string>('artists');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<EnrichResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedModeHint = ENRICHMENT_MODES.find((m) => m.value === mode)?.hint ?? '';

  async function handleEnrich(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || submitting) return;
    setSubmitting(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch(`/api/admin/venues/${venueId}/enrich`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), mode })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? 'Enrichment failed.');
        return;
      }
      setResult(data);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
        Enter a URL from <strong>{venueName}</strong>
        {venueDomain ? ` (${venueDomain})` : ''} and choose what to extract.
        The page will be fetched and queued through the intake pipeline.
        You can also{' '}
        <a
          href={`/inspect?url=${encodeURIComponent(venueWebsiteUrl ?? '')}`}
          className="inline-link"
        >
          open in the AI inspector
        </a>
        {' '}to explore the page interactively first.
      </p>

      <form onSubmit={handleEnrich} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
            URL to enrich
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={`https://${venueDomain ?? 'gallery.example.com'}/artists`}
            style={{
              width: '100%', padding: '8px 12px', fontSize: 14,
              borderRadius: 6, border: '1px solid var(--border)'
            }}
            disabled={submitting}
          />
          {selectedModeHint ? (
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Hint: {selectedModeHint}
            </p>
          ) : null}
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
            Extract
          </label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            style={{
              padding: '8px 10px', fontSize: 14, borderRadius: 6,
              border: '1px solid var(--border)', background: 'var(--surface)'
            }}
            disabled={submitting}
          >
            {ENRICHMENT_MODES.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={submitting || !url.trim()}
          style={{
            padding: '8px 18px', fontSize: 14, borderRadius: 6,
            border: 'none', background: 'var(--primary)', color: '#fff',
            cursor: submitting || !url.trim() ? 'not-allowed' : 'pointer',
            opacity: submitting || !url.trim() ? 0.6 : 1
          }}
        >
          {submitting ? 'Queuing…' : 'Run enrichment'}
        </button>
      </form>

      {error ? (
        <p role="alert" style={{ fontSize: 13, color: 'var(--danger)', padding: '8px 12px', background: 'var(--danger-soft)', borderRadius: 6 }}>
          {error}
        </p>
      ) : null}

      {result ? (
        <div style={{ padding: '10px 14px', background: 'var(--success-soft)', borderRadius: 6, fontSize: 13 }}>
          <strong>✓ Enrichment queued</strong> — mode: {result.mode}
          {' · '}
          <a href={`/intake/${result.ingestionJobId}`} className="inline-link">
            Monitor intake job →
          </a>
          {' · '}
          <a href={`/inspect?url=${encodeURIComponent(result.url)}`} className="inline-link">
            Open in inspector →
          </a>
        </div>
      ) : null}

      {venueDomain ? (
        <div style={{ marginTop: 4 }}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            Quick links — common page patterns for {venueDomain}:
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {[
              { path: '/artists', mode: 'artists' },
              { path: '/exhibitions', mode: 'events' },
              { path: '/works', mode: 'artworks' },
              { path: '/whats-on', mode: 'events' },
              { path: '/about', mode: 'gallery' }
            ].map(({ path, mode: m }) => (
              <button
                key={path}
                type="button"
                onClick={() => {
                  setUrl(`https://${venueDomain}${path}`);
                  setMode(m);
                }}
                style={{
                  fontSize: 12, padding: '3px 10px', borderRadius: 4,
                  border: '1px solid var(--border)', background: 'var(--surface)',
                  cursor: 'pointer', color: 'var(--text-muted)'
                }}
              >
                {path} ({m})
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
