'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface ApiKeyInfo {
  envVar: string;
  present: boolean;
}

export function ProviderSwitcher({
  activeProvider,
  aiKeys
}: {
  activeProvider: 'anthropic' | 'openai' | 'gemini';
  aiKeys: ApiKeyInfo[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [switching, setSwitching] = useState<string | null>(null);

  const labels: Record<string, string> = {
    anthropic: 'Anthropic (Claude)',
    openai: 'OpenAI (GPT)',
    gemini: 'Google Gemini'
  };
  const envVars: Record<string, string> = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    gemini: 'GEMINI_API_KEY'
  };

  async function handleSwitch(provider: string) {
    if (switching) return;
    setSwitching(provider);
    try {
      await fetch('/api/admin/config/ai-provider', {
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
      {(['anthropic', 'openai', 'gemini'] as const).map((provider) => {
        const keyPresent = aiKeys.find((k) => k.envVar === envVars[provider])?.present ?? false;
        const isActive = activeProvider === provider;
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
              <code style={{ fontSize: 12, color: 'var(--text-muted)' }}>{envVars[provider]}</code>
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
              {keyPresent ? 'Key configured' : 'Key missing'}
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
