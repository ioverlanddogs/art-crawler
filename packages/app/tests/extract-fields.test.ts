import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.restoreAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('extractFields', () => {
  test('falls back to stub when no provider keys are configured', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const prismaMock = {
      siteSetting: { findUnique: vi.fn().mockResolvedValue(null) }
    };

    const { extractFields } = await import('@/lib/intake/extract-fields');
    const result = await extractFields(
      { extractedText: 'hello world', sourceUrl: 'https://example.com' },
      prismaMock as never
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.warningsJson).toContain('no_api_key_configured');
    expect(result.modelVersion).toBe('stub-v0');
  });

  test('parses valid JSON response including fenced JSON', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [
            {
              type: 'text',
              text: '```json\n{"title":"Sample","confidence":{"title":0.9},"evidence":{"title":"Sample sentence"}}\n```'
            }
          ],
          usage: { input_tokens: 123, output_tokens: 45 }
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const prismaMock = {
      siteSetting: { findUnique: vi.fn().mockResolvedValue(null) }
    };

    const { extractFields } = await import('@/lib/intake/extract-fields');
    const result = await extractFields(
      { extractedText: 'hello world', sourceUrl: 'https://example.com' },
      prismaMock as never
    );

    expect(result.modelVersion).toBe('claude-haiku-4-5-20251001');
    expect(result.parserVersion).toBe('prompt-v1');
    expect(result.extractedFieldsJson.title).toBe('Sample');
    expect(result.confidenceJson).toEqual({ title: 0.9 });
    expect(result.evidenceJson).toEqual({ title: ['Sample sentence'] });
  });

  test('falls back to stub with no_api_key_configured when JSON is malformed', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            content: [{ type: 'text', text: '{"title":' }]
          }),
          { status: 200 }
        )
      )
    );

    const prismaMock = {
      siteSetting: { findUnique: vi.fn().mockResolvedValue(null) }
    };

    const { extractFields } = await import('@/lib/intake/extract-fields');
    const result = await extractFields(
      { extractedText: 'hello world', sourceUrl: 'https://example.com' },
      prismaMock as never
    );

    expect(result.warningsJson).toContain('no_api_key_configured');
    expect(result.modelVersion).toBe('stub-v0');
  });

  test('falls back to stub when API returns non-200', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('upstream error', { status: 500 })));

    const prismaMock = {
      siteSetting: { findUnique: vi.fn().mockResolvedValue(null) }
    };

    const { extractFields } = await import('@/lib/intake/extract-fields');
    const result = await extractFields(
      { extractedText: 'hello world', sourceUrl: 'https://example.com' },
      prismaMock as never
    );

    expect(result.warningsJson).toContain('no_api_key_configured');
    expect(result.modelVersion).toBe('stub-v0');
  });
});
