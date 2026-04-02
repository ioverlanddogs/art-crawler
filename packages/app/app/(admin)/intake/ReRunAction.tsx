'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const MODES = [
  { value: 'events', label: "Events / What's On" },
  { value: 'artists', label: 'Artists' },
  { value: 'artworks', label: 'Artworks' },
  { value: 'gallery', label: 'Gallery / Venue info' },
  { value: 'auto', label: 'Auto-detect' }
] as const;

export function ReRunAction({
  sourceUrl,
  recommendedMode
}: {
  sourceUrl: string;
  recommendedMode?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<string>(recommendedMode ?? 'events');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleReRun() {
    if (submitting) return;
    setSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch('/api/admin/intake', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceUrl,
          recordTypeOverride: mode
        })
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMessage(typeof body?.error === 'string' ? body.error : 'Re-run failed.');
        return;
      }

      router.push(`/intake/${body.ingestionJobId}`);
    } catch {
      setMessage('Network error — please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>
          Extract as:
        </label>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          disabled={submitting}
          style={{
            padding: '6px 10px',
            fontSize: 13,
            borderRadius: 4,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            cursor: 'pointer'
          }}
        >
          {MODES.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <button
          onClick={handleReRun}
          disabled={submitting}
          style={{
            padding: '6px 16px',
            fontSize: 13,
            borderRadius: 4,
            border: 'none',
            background: 'var(--primary)',
            color: '#fff',
            cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.6 : 1
          }}
        >
          {submitting ? 'Queuing…' : 'Re-run intake'}
        </button>
      </div>
      {message ? (
        <p style={{ fontSize: 13, color: 'var(--danger)' }}>{message}</p>
      ) : null}
    </div>
  );
}
