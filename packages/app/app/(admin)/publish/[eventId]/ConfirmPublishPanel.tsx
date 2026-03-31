'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog, SectionCard, ToastRegion, type ToastMessage } from '@/components/admin';

export function ConfirmPublishPanel({ eventId, blockers, warnings }: { eventId: string; blockers: string[]; warnings: string[] }) {
  const router = useRouter();
  const [releaseSummary, setReleaseSummary] = useState('');
  const [pending, setPending] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function pushToast(message: Omit<ToastMessage, 'id'>) {
    setToasts((current) => [...current, { id: crypto.randomUUID(), ...message }]);
  }

  async function onConfirm() {
    setPending(true);
    const response = await fetch(`/api/admin/publish/${eventId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ releaseSummary: releaseSummary || undefined })
    });

    if (response.ok) {
      pushToast({ tone: 'success', title: 'Event published', description: 'Redirecting back to queue…' });
      setTimeout(() => router.push('/publish'), 400);
      return;
    }

    if (response.status === 409) {
      const payload = (await response.json().catch(() => null)) as { blockers?: string[]; warnings?: string[] } | null;
      pushToast({
        tone: 'error',
        title: 'Publish blocked by readiness gate',
        description: [...(payload?.blockers ?? []), ...(payload?.warnings ?? [])].join(' ')
      });
      setPending(false);
      return;
    }

    pushToast({ tone: 'error', title: 'Publish failed', description: `Request failed with status ${response.status}.` });
    setPending(false);
  }

  return (
    <SectionCard title="Confirm release" subtitle="Publishing is immediate and marks ingestion as published.">
      <ToastRegion messages={toasts} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />

      {blockers.length > 0 ? (
        <div className="stack">
          <p className="muted">Resolve blockers before publishing:</p>
          <ul className="timeline">
            {blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <p className="muted">Warnings: {warnings.join(' · ')}</p>
      ) : null}

      <div className="stack">
        <label htmlFor="releaseSummary">Release summary (optional)</label>
        <textarea
          id="releaseSummary"
          className="text-area"
          value={releaseSummary}
          onChange={(event) => setReleaseSummary(event.target.value)}
          placeholder="Describe what changed in this publish batch"
        />
      </div>

      <div className="filters-row">
        <button type="button" className="action-button variant-primary" disabled={pending || blockers.length > 0} onClick={() => setConfirmOpen(true)}>
          {pending ? 'Publishing…' : 'Confirm publish'}
        </button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title="Confirm publish"
        body="Publishing is immediate. You can roll back later from version history."
        tone="default"
        confirmLabel="Publish now"
        submitting={pending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          void onConfirm();
        }}
      />
    </SectionCard>
  );
}
