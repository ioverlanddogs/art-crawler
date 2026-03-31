'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ActionButton, IntakeForm } from '@/components/admin';

export function IntakePageClient() {
  const router = useRouter();

  return (
    <IntakeForm
      onSuccess={(result) => {
        router.push(`/intake/${result.ingestionJobId}`);
      }}
    />
  );
}

export function IntakeRetryAction({ id }: { id: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function retry() {
    if (submitting) return;
    setSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/admin/intake/${id}/retry`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMessage(typeof body?.error === 'string' ? body.error : 'Retry failed');
        return;
      }

      setMessage('Retry queued.');
      router.refresh();
    } catch {
      setMessage('Network error — please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="stack">
      <ActionButton variant="secondary" onClick={retry} submitting={submitting}>
        Retry
      </ActionButton>
      {message ? <p className="muted">{message}</p> : null}
    </div>
  );
}
