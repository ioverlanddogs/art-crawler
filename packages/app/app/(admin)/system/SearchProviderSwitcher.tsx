'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface KeyInfo {
  envVar: string;
  present: boolean;
}

export function SearchProviderSwitcher({
  activeSearchProvider,
  searchKeys
}: {
  activeSearchProvider: 'brave' | 'google_cse';
  searchKeys: KeyInfo[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [switching, setSwitching] = useState<string | null>(null);

  const labels: Record<string, string> = {
    brave: 'Brave Search',
    google_cse: 'Google Custom Search'
  };
  const requiredKeys: Record<string, string[]> = {
    brave: ['BRAVE_SEARCH_API_KEY'],
    google_cse: ['GOOGLE_CSE_API_KEY', 'GOOGLE_CSE_ID']
  };

  async function handleSwitch(provider: string) {
    if (switching) return;
    setSwitching(provider);
    try {
      await fetch('/api/admin/config/search-provider', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider })
      });
      startTransition(() => {
        router.refresh();
      });
    } finally {
      setSwitching(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' }}>
      {(['brave', 'google_cse'] as const).map((provider) => {
        const keyPresent = requiredKeys[provider].every(
          (envVar) => searchKeys.find((k) => k.envVar === envVar)?.present ?? false
        );
        const isActive = activeSearchProvider === provider;
        const isSwitching = switching === provider;

        return (
          <div
            key={provider}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 14px',
              borderRadius: 6,
              border: `1px solid ${isActive ? 'var(--primary)' : 'var(--border)'}`,
              background: isActive ? 'var(--primary-soft)' : 'var(--surface)'
            }}
          >
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 500, fontSize: 14 }}>{labels[provider]}</span>{' '}
              <code style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {requiredKeys[provider].join(' + ')}
              </code>
            </div>
            <span
              style={{
                fontSize: 12,
                fontWeight: 500,
                padding: '2px 8px',
                borderRadius: 4,
                background: keyPresent ? 'var(--success-soft)' : 'var(--surface-muted)',
                color: keyPresent ? 'var(--success)' : 'var(--text-muted)'
              }}
            >
              {keyPresent ? 'Keys configured' : 'Keys missing'}
            </span>
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
                onClick={() => handleSwitch(provider)}
                disabled={!keyPresent || switching !== null}
                style={{
                  fontSize: 12,
                  padding: '4px 12px',
                  borderRadius: 4,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  cursor: !keyPresent || switching !== null ? 'not-allowed' : 'pointer',
                  color: !keyPresent ? 'var(--text-muted)' : 'var(--text)',
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
