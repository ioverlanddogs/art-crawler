'use client';

import { useState } from 'react';

export function PromoteVenueAction({
  proposedChangeSetId,
  extractedName
}: {
  proposedChangeSetId: string;
  extractedName?: string;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ venueId: string; venueName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nameOverride, setNameOverride] = useState(extractedName ?? '');

  async function handlePromote() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/venues/promote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          proposedChangeSetId,
          overrides: nameOverride.trim() ? { name: nameOverride.trim() } : undefined
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? 'Promotion failed.');
        return;
      }
      setResult({ venueId: data.venue.id, venueName: data.venue.name });
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div style={{ padding: '10px 14px', background: 'var(--success-soft)', borderRadius: 6, fontSize: 13 }}>
        <strong>✓ Venue created: {result.venueName}</strong>
        {' · '}
        <a href={`/venues/${result.venueId}`} className="inline-link">
          Open venue →
        </a>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
        This change set was extracted with gallery mode. Promote it to create a canonical Venue record.
      </p>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
            Venue name (override optional)
          </label>
          <input
            type="text"
            value={nameOverride}
            onChange={(e) => setNameOverride(e.target.value)}
            placeholder={extractedName ?? 'Gallery name'}
            style={{
              width: '100%', padding: '7px 10px', fontSize: 13,
              borderRadius: 6, border: '1px solid var(--border)'
            }}
          />
        </div>
        <button
          onClick={handlePromote}
          disabled={submitting}
          style={{
            padding: '7px 16px', fontSize: 13, borderRadius: 6,
            border: 'none', background: 'var(--primary)', color: '#fff',
            cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.6 : 1
          }}
        >
          {submitting ? 'Promoting…' : 'Promote to Venue →'}
        </button>
      </div>
      {error ? (
        <p role="alert" style={{ fontSize: 12, color: 'var(--danger)' }}>{error}</p>
      ) : null}
    </div>
  );
}
