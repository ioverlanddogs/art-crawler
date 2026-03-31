'use client';

import { useState } from 'react';

type Reviewer = { id: string; name: string | null; email: string };

export function AssignmentControls({ endpoint, reviewers, currentAssigneeId }: { endpoint: string; reviewers: Reviewer[]; currentAssigneeId?: string | null }) {
  const [reviewerId, setReviewerId] = useState(currentAssigneeId ?? reviewers[0]?.id ?? '');
  const [busy, setBusy] = useState(false);

  async function act(action: 'assign' | 'reassign' | 'claim' | 'escalate' | 'snooze') {
    setBusy(true);
    await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, reviewerId })
    });
    setBusy(false);
    window.location.reload();
  }

  return (
    <div className="filters-row">
      <select className="input" value={reviewerId} onChange={(event) => setReviewerId(event.target.value)} disabled={busy}>
        {reviewers.map((reviewer) => (
          <option key={reviewer.id} value={reviewer.id}>
            {reviewer.name ?? reviewer.email}
          </option>
        ))}
      </select>
      <button type="button" className="action-button variant-secondary" disabled={busy} onClick={() => act(currentAssigneeId ? 'reassign' : 'assign')}>Assign</button>
      <button type="button" className="action-button variant-secondary" disabled={busy} onClick={() => act('claim')}>Claim</button>
      <button type="button" className="action-button variant-secondary" disabled={busy} onClick={() => act('snooze')}>Snooze</button>
      <button type="button" className="action-button variant-primary" disabled={busy} onClick={() => act('escalate')}>Escalate</button>
    </div>
  );
}
