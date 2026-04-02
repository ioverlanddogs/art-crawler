'use client';

import { useState } from 'react';
import { ActionButton } from '@/components/admin';

interface IntakeFormProps {
  onSuccess: (result: { ingestionJobId: string; proposedChangeSetId: string | null }) => void;
}

export function IntakeForm({ onSuccess }: IntakeFormProps) {
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceLabel, setSourceLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [mode, setMode] = useState<string>('events');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function clearForm() {
    setSourceUrl('');
    setSourceLabel('');
    setNotes('');
    setErrorMessage(null);
  }

  async function submit() {
    if (submitting) return;

    try {
      new URL(sourceUrl);
    } catch {
      setErrorMessage('Please enter a valid URL');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/admin/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrl,
          sourceLabel: sourceLabel.trim() || undefined,
          notes: notes.trim() || undefined,
          recordTypeOverride: mode
        })
      });

      const body = await res.json().catch(() => ({}));

      if (res.status === 201) {
        onSuccess({ ingestionJobId: body.ingestionJobId, proposedChangeSetId: body.proposedChangeSetId ?? null });
        return;
      }

      if (res.status >= 400 && res.status < 500) {
        setErrorMessage(typeof body?.error === 'string' ? body.error : 'Request failed');
        return;
      }

      setErrorMessage('Network error — please try again.');
    } catch {
      setErrorMessage('Network error — please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="stack" aria-label="Intake URL submission">
      <label className="stack">
        <span>Source URL</span>
        <input
          className="input"
          type="url"
          value={sourceUrl}
          onChange={(event) => setSourceUrl(event.target.value)}
          placeholder="https://example.com/events/gallery-opening"
        />
      </label>

      <label className="stack">
        <span>Source label (optional)</span>
        <input className="input" type="text" value={sourceLabel} onChange={(event) => setSourceLabel(event.target.value)} />
      </label>

      <label className="stack">
        <span>Notes (optional)</span>
        <textarea className="input" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>

      {errorMessage ? <p className="dialog-error">{errorMessage}</p> : null}


      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 13, fontWeight: 500 }}>Extract as</label>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          style={{
            padding: '8px 10px',
            fontSize: 14,
            borderRadius: 4,
            border: '1px solid var(--border)',
            background: 'var(--surface)'
          }}
        >
          <option value="events">Events / What's On</option>
          <option value="artists">Artists</option>
          <option value="artworks">Artworks</option>
          <option value="gallery">Gallery / Venue info</option>
          <option value="auto">Auto-detect</option>
        </select>
      </div>


      <div className="filters-row">
        <ActionButton onClick={submit} disabled={!sourceUrl.trim()} submitting={submitting}>
          Ingest and parse
        </ActionButton>
        <ActionButton variant="secondary" onClick={clearForm} disabled={submitting}>
          Cancel
        </ActionButton>
      </div>
    </div>
  );
}
