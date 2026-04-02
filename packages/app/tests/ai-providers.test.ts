import { describe, expect, test, vi, afterEach } from 'vitest';

describe('StubProvider', () => {
  test('extracts title from <title> tag', async () => {
    const { StubProvider } = await import('@/lib/ai/stub-provider');
    const provider = new StubProvider();
    const result = await provider.extractFields({
      extractedText: '<html><title>My Event</title></html>',
      sourceUrl: 'https://example.com/event'
    });
    expect(result.extractedFieldsJson.title).toBe('My Event');
    expect(result.warningsJson).toContain('no_api_key_configured');
    expect(result.modelVersion).toBe('stub-v0');
  });

  test('falls back to hostname when no title tag', async () => {
    const { StubProvider } = await import('@/lib/ai/stub-provider');
    const provider = new StubProvider();
    const result = await provider.extractFields({
      extractedText: 'No title here',
      sourceUrl: 'https://gallery.example.com/shows'
    });
    expect(result.extractedFieldsJson.title).toBe('gallery.example.com');
  });
});

describe('buildExtractionPrompt', () => {
  test('includes source URL and truncated text', async () => {
    const { buildExtractionPrompt } = await import('@/lib/ai/prompt');
    const prompt = buildExtractionPrompt({
      sourceUrl: 'https://example.com',
      extractedText: 'Some event text'
    });
    expect(prompt).toContain('https://example.com');
    expect(prompt).toContain('Some event text');
    expect(prompt).toContain('title');
    expect(prompt).toContain('startAt');
  });

  test('truncates extractedText to 4000 chars', async () => {
    const { buildExtractionPrompt } = await import('@/lib/ai/prompt');
    const longText = 'a'.repeat(5000);
    const prompt = buildExtractionPrompt({
      sourceUrl: 'https://example.com',
      extractedText: longText
    });
    expect(prompt).toContain('a'.repeat(4000));
    expect(prompt).not.toContain('a'.repeat(4001));
  });
});

describe('getActiveExtractionProvider', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  test('returns AnthropicProvider when ANTHROPIC_API_KEY is set and no DB preference', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test');
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('GEMINI_API_KEY', '');

    const prismaMock = {
      siteSetting: { findUnique: vi.fn().mockResolvedValue(null) }
    };

    const { getActiveExtractionProvider } = await import('@/lib/ai/provider-selector');
    const provider = await getActiveExtractionProvider(prismaMock as never);
    expect(provider.name).toBe('anthropic');
  });

  test('returns OpenAIProvider when DB prefers openai and key is set', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-openai-test');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test');

    const prismaMock = {
      siteSetting: {
        findUnique: vi.fn().mockResolvedValue({ key: 'ai_extraction_provider', value: 'openai' })
      }
    };

    const { getActiveExtractionProvider } = await import('@/lib/ai/provider-selector');
    const provider = await getActiveExtractionProvider(prismaMock as never);
    expect(provider.name).toBe('openai');
    expect(provider.modelId).toBe('gpt-4o-mini');
  });

  test('falls back to auto-detect when DB preferred provider has no key', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test');
    vi.stubEnv('GEMINI_API_KEY', '');

    const prismaMock = {
      siteSetting: {
        findUnique: vi.fn().mockResolvedValue({ key: 'ai_extraction_provider', value: 'openai' })
      }
    };

    const { getActiveExtractionProvider } = await import('@/lib/ai/provider-selector');
    const provider = await getActiveExtractionProvider(prismaMock as never);
    expect(provider.name).toBe('anthropic');
  });

  test('returns StubProvider when no keys are set', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('GEMINI_API_KEY', '');

    const prismaMock = {
      siteSetting: { findUnique: vi.fn().mockResolvedValue(null) }
    };

    const { getActiveExtractionProvider } = await import('@/lib/ai/provider-selector');
    const provider = await getActiveExtractionProvider(prismaMock as never);
    expect(provider.modelId).toBe('stub-v0');
  });

  test('returns GeminiProvider when DB prefers gemini and key is set', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'gemini-test-key');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', '');

    const prismaMock = {
      siteSetting: {
        findUnique: vi.fn().mockResolvedValue({ key: 'ai_extraction_provider', value: 'gemini' })
      }
    };

    const { getActiveExtractionProvider } = await import('@/lib/ai/provider-selector');
    const provider = await getActiveExtractionProvider(prismaMock as never);
    expect(provider.name).toBe('gemini');
    expect(provider.modelId).toBe('gemini-1.5-flash');
  });
});
