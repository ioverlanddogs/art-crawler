'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const OPTIONS = [
  { label: 'replace canonical', status: 'resolved_merge' },
  { label: 'enrich missing fields only', status: 'resolved_merge' },
  { label: 'keep canonical', status: 'resolved_separate' },
  { label: 'create separate record', status: 'resolved_separate' },
  { label: 'manual override', status: 'resolved_merge' }
] as const;

export function DuplicateDecisionPanel({ candidateId }: { candidateId: string }) {
  const [strategy, setStrategy] = useState<(typeof OPTIONS)[number]['label']>('enrich missing fields only');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(status: 'resolved_merge' | 'resolved_separate' | 'false_positive' | 'escalated' | 'unresolved') {
    setBusy(true);
    await fetch(`/api/admin/duplicates/${candidateId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resolutionStatus: status, reviewerNote: note, strategy })
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="stack">
      <label className="stack">
        <span className="muted">Merge strategy</span>
        <select className="select" value={strategy} onChange={(event) => setStrategy(event.target.value as (typeof OPTIONS)[number]['label'])}>
          {OPTIONS.map((option) => <option key={option.label} value={option.label}>{option.label}</option>)}
        </select>
      </label>

      <label className="stack">
        <span className="muted">Reviewer note</span>
        <textarea className="input" value={note} onChange={(event) => setNote(event.target.value)} rows={5} placeholder="Rationale, confidence explanation, and duplicate-risk explanation." />
      </label>

      <div className="filters-row">
        <button disabled={busy} className="action-button variant-primary" onClick={() => submit(strategy.includes('separate') || strategy.includes('keep canonical') ? 'resolved_separate' : 'resolved_merge')}>Resolve duplicate</button>
        <button disabled={busy} className="action-button variant-secondary" onClick={() => submit('unresolved')}>Defer</button>
        <button disabled={busy} className="action-button variant-secondary" onClick={() => submit('false_positive')}>False positive</button>
        <button disabled={busy} className="action-button variant-secondary" onClick={() => submit('escalated')}>Escalate</button>
      </div>
    </div>
  );
}
