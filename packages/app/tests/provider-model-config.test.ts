import { describe, expect, test, vi, afterEach } from 'vitest';

describe('PROVIDER_MODELS catalogue', () => {
  test('all three providers have at least one model', async () => {
    const { PROVIDER_MODELS } = await import('@/lib/ai/provider-selector');
    expect(PROVIDER_MODELS.anthropic.length).toBeGreaterThan(0);
    expect(PROVIDER_MODELS.openai.length).toBeGreaterThan(0);
    expect(PROVIDER_MODELS.gemini.length).toBeGreaterThan(0);
  });

  test('every model entry has a non-empty id and label', async () => {
    const { PROVIDER_MODELS } = await import('@/lib/ai/provider-selector');
    for (const models of Object.values(PROVIDER_MODELS)) {
      for (const m of models) {
        expect(m.id.length).toBeGreaterThan(0);
        expect(m.label.length).toBeGreaterThan(0);
      }
    }
  });

  test('getDefaultModel returns the first model for each provider', async () => {
    const { PROVIDER_MODELS, getDefaultModel } = await import('@/lib/ai/provider-selector');
    expect(getDefaultModel('anthropic')).toBe(PROVIDER_MODELS.anthropic[0].id);
    expect(getDefaultModel('openai')).toBe(PROVIDER_MODELS.openai[0].id);
    expect(getDefaultModel('gemini')).toBe(PROVIDER_MODELS.gemini[0].id);
  });
});

describe('provider model override via SiteSetting', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  test('uses model from SiteSetting when set', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubEnv('GEMINI_API_KEY', '');

    const prismaMock = {
      siteSetting: {
        findUnique: vi.fn()
          .mockResolvedValueOnce({ key: 'ai_extraction_provider', value: 'openai' })
          .mockResolvedValueOnce({ key: 'ai_extraction_model', value: 'gpt-4o' })
      }
    };

    const { getActiveExtractionProvider } = await import('@/lib/ai/provider-selector');
    const provider = await getActiveExtractionProvider(prismaMock as never);
    expect(provider.name).toBe('openai');
    expect(provider.modelId).toBe('gpt-4o');
  });

  test('uses default model when SiteSetting model is not set', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubEnv('GEMINI_API_KEY', '');

    const prismaMock = {
      siteSetting: {
        findUnique: vi.fn()
          .mockResolvedValueOnce({ key: 'ai_extraction_provider', value: 'openai' })
          .mockResolvedValueOnce(null)
      }
    };

    const { getActiveExtractionProvider } = await import('@/lib/ai/provider-selector');
    const provider = await getActiveExtractionProvider(prismaMock as never);
    expect(provider.name).toBe('openai');
    expect(provider.modelId).toBe('gpt-4o-mini');
  });

  test('AnthropicProvider uses provided modelId', async () => {
    const { AnthropicProvider } = await import('@/lib/ai/providers/anthropic');
    const provider = new AnthropicProvider('sk-test', 'claude-sonnet-4-6');
    expect(provider.modelId).toBe('claude-sonnet-4-6');
  });

  test('AnthropicProvider falls back to default when no modelId given', async () => {
    const { AnthropicProvider } = await import('@/lib/ai/providers/anthropic');
    const provider = new AnthropicProvider('sk-test');
    expect(provider.modelId).toBe('claude-haiku-4-5-20251001');
  });

  test('OpenAIProvider uses provided modelId', async () => {
    const { OpenAIProvider } = await import('@/lib/ai/providers/openai');
    const provider = new OpenAIProvider('sk-test', 'gpt-4o');
    expect(provider.modelId).toBe('gpt-4o');
  });

  test('GeminiProvider uses provided modelId', async () => {
    const { GeminiProvider } = await import('@/lib/ai/providers/gemini');
    const provider = new GeminiProvider('gemini-test', 'gemini-2.0-flash');
    expect(provider.modelId).toBe('gemini-2.0-flash');
  });
});
