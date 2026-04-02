import { afterEach, describe, expect, test, vi } from 'vitest';

describe('getActiveSearchProvider', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  test('returns BraveSearchProvider when BRAVE key is set and no DB preference', async () => {
    vi.stubEnv('BRAVE_SEARCH_API_KEY', 'brave-test-key');
    vi.stubEnv('GOOGLE_CSE_API_KEY', '');
    vi.stubEnv('GOOGLE_CSE_ID', '');

    const prismaMock = { siteSetting: { findUnique: vi.fn().mockResolvedValue(null) } };
    const { getActiveSearchProvider } = await import('@/lib/search/provider-selector');
    const provider = await getActiveSearchProvider(prismaMock as never);
    expect(provider?.name).toBe('brave');
  });

  test('returns GoogleCseProvider when DB prefers google_cse and both keys are set', async () => {
    vi.stubEnv('GOOGLE_CSE_API_KEY', 'cse-key');
    vi.stubEnv('GOOGLE_CSE_ID', 'cse-id');
    vi.stubEnv('BRAVE_SEARCH_API_KEY', '');

    const prismaMock = {
      siteSetting: { findUnique: vi.fn().mockResolvedValue({ key: 'search_provider', value: 'google_cse' }) }
    };
    const { getActiveSearchProvider } = await import('@/lib/search/provider-selector');
    const provider = await getActiveSearchProvider(prismaMock as never);
    expect(provider?.name).toBe('google_cse');
  });

  test('falls back to auto-detect when preferred provider keys are missing', async () => {
    vi.stubEnv('GOOGLE_CSE_API_KEY', '');
    vi.stubEnv('GOOGLE_CSE_ID', '');
    vi.stubEnv('BRAVE_SEARCH_API_KEY', 'brave-fallback-key');

    const prismaMock = {
      siteSetting: { findUnique: vi.fn().mockResolvedValue({ key: 'search_provider', value: 'google_cse' }) }
    };
    const { getActiveSearchProvider } = await import('@/lib/search/provider-selector');
    const provider = await getActiveSearchProvider(prismaMock as never);
    expect(provider?.name).toBe('brave');
  });

  test('returns null when no search keys are configured', async () => {
    vi.stubEnv('BRAVE_SEARCH_API_KEY', '');
    vi.stubEnv('GOOGLE_CSE_API_KEY', '');
    vi.stubEnv('GOOGLE_CSE_ID', '');

    const prismaMock = { siteSetting: { findUnique: vi.fn().mockResolvedValue(null) } };
    const { getActiveSearchProvider } = await import('@/lib/search/provider-selector');
    const provider = await getActiveSearchProvider(prismaMock as never);
    expect(provider).toBeNull();
  });
});
