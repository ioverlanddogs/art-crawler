import type { AiExtractionProvider, AiExtractionResult } from './types';

/**
 * Stub provider — used when no API key is configured.
 * Returns a minimal result with a title extracted from HTML or the hostname.
 */
export class StubProvider implements AiExtractionProvider {
  readonly name = 'anthropic' as const;
  readonly modelId = 'stub-v0';

  async extractFields(input: {
    extractedText: string;
    sourceUrl: string;
  }): Promise<AiExtractionResult> {
    const titleMatch = input.extractedText.match(/<title[^>]*>(.*?)<\/title>/i);
    const fallbackTitle = new URL(input.sourceUrl).hostname;
    const title = titleMatch?.[1]?.trim() || fallbackTitle;
    return {
      extractedFieldsJson: { title },
      confidenceJson: { title: 0.4 },
      evidenceJson: { title: [] },
      warningsJson: ['no_api_key_configured'],
      modelVersion: 'stub-v0',
      parserVersion: 'regex-v0'
    };
  }
}
