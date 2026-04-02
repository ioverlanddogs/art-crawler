import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';

describe('getApiKeyStatuses', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('returns not-present for all keys when env vars are absent', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubEnv('BRAVE_SEARCH_API_KEY', '');
    vi.stubEnv('GOOGLE_CLIENT_ID', '');

    const { getApiKeyStatuses } = await import('@/lib/api-key-status');
    const groups = getApiKeyStatuses();
    const allKeys = groups.flatMap((g) => g.keys);

    const anthropic = allKeys.find((k) => k.envVar === 'ANTHROPIC_API_KEY');
    expect(anthropic?.present).toBe(false);
  });

  test('returns present=true when env var is set to a non-empty value', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test-key');

    const { getApiKeyStatuses } = await import('@/lib/api-key-status');
    const groups = getApiKeyStatuses();
    const allKeys = groups.flatMap((g) => g.keys);

    const anthropic = allKeys.find((k) => k.envVar === 'ANTHROPIC_API_KEY');
    expect(anthropic?.present).toBe(true);
  });

  test('returns false for whitespace-only values', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '   ');

    const { getApiKeyStatuses } = await import('@/lib/api-key-status');
    const groups = getApiKeyStatuses();
    const allKeys = groups.flatMap((g) => g.keys);

    const anthropic = allKeys.find((k) => k.envVar === 'ANTHROPIC_API_KEY');
    expect(anthropic?.present).toBe(false);
  });

  test('returns 4 groups with expected group names', async () => {
    const { getApiKeyStatuses } = await import('@/lib/api-key-status');
    const groups = getApiKeyStatuses();

    expect(groups.map((g) => g.group)).toEqual(['AI extraction', 'Search', 'Authentication', 'Infrastructure']);
  });

  test('every key has a non-empty name, envVar, and description', async () => {
    const { getApiKeyStatuses } = await import('@/lib/api-key-status');
    const groups = getApiKeyStatuses();
    const allKeys = groups.flatMap((g) => g.keys);

    for (const key of allKeys) {
      expect(key.name.length).toBeGreaterThan(0);
      expect(key.envVar.length).toBeGreaterThan(0);
      expect(key.description.length).toBeGreaterThan(0);
    }
  });
});
