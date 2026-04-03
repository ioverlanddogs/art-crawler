'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface ModelInfo {
  id: string;
  label: string;
}

export function ModelSwitcher({
  activeModelId,
  models
}: {
  activeModelId: string | null;
  models: ModelInfo[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [switching, setSwitching] = useState<string | null>(null);

  const effectiveModel = activeModelId ?? models[0]?.id ?? '';

  async function handleSwitch(modelId: string) {
    if (switching) return;
    setSwitching(modelId);
    try {
      await fetch('/api/admin/config/ai-model', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: modelId })
      });
      startTransition(() => {
        router.refresh();
      });
    } finally {
      setSwitching(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {models.map((m) => {
        const isActive = effectiveModel === m.id;
        const isSwitching = switching === m.id;

        return (
          <div
            key={m.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '8px 12px',
              borderRadius: 6,
              border: `1px solid ${isActive ? 'var(--primary)' : 'var(--border)'}`,
              background: isActive ? 'var(--primary-soft)' : 'var(--surface)'
            }}
          >
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 500, fontSize: 13 }}>{m.label}</span>{' '}
              <code style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.id}</code>
            </div>
            {isActive ? (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: 'var(--primary)',
                  minWidth: 80,
                  textAlign: 'right'
                }}
              >
                Active
              </span>
            ) : (
              <button
                onClick={() => handleSwitch(m.id)}
                disabled={switching !== null}
                style={{
                  fontSize: 12,
                  padding: '4px 12px',
                  borderRadius: 4,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  cursor: switching !== null ? 'not-allowed' : 'pointer',
                  color: 'var(--text)',
                  minWidth: 80
                }}
              >
                {isSwitching ? 'Switching…' : 'Use this'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
