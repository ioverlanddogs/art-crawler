import type { AiExtractionProvider, AiExtractionResult } from '../types';
import { buildExtractionPrompt } from '../prompt';
import { StubProvider } from '../stub-provider';

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asNumberRecord(value: unknown): Record<string, number> {
  const r = asRecord(value);
  return Object.fromEntries(
    Object.entries(r).filter(([, v]) => typeof v === 'number')
  ) as Record<string, number>;
}

function asEvidenceRecord(value: unknown): Record<string, string[]> {
  const r = asRecord(value);
  return Object.fromEntries(
    Object.entries(r).map(([k, v]) => {
      if (Array.isArray(v)) return [k, v.filter((e): e is string => typeof e === 'string')];
      if (typeof v === 'string') return [k, [v]];
      return [k, []];
    })
  );
}

function stripFences(value: string): string {
  return value.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

export class AnthropicProvider implements AiExtractionProvider {
  readonly name = 'anthropic' as const;
  readonly modelId: string;

  constructor(private readonly apiKey: string, modelId?: string) {
    this.modelId = modelId ?? 'claude-haiku-4-5-20251001';
  }

  async extractFields(input: {
    extractedText: string;
    sourceUrl: string;
  }): Promise<AiExtractionResult> {
    const stub = new StubProvider();

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: this.modelId,
        max_tokens: 1024,
        system:
          'You are a structured data extraction assistant for an arts and culture events platform. Extract event data from the provided page text and return ONLY a JSON object with no preamble or markdown.',
        messages: [
          {
            role: 'user',
            content: buildExtractionPrompt(input)
          }
        ]
      })
    }).catch(() => null);

    if (!response || !response.ok) return stub.extractFields(input);

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return stub.extractFields(input);
    }

    const content = Array.isArray((payload as Record<string, unknown>)?.content)
      ? ((payload as Record<string, unknown>).content as unknown[])
      : [];
    const textBlock = content.find(
      (b): b is { type: string; text: string } =>
        typeof (b as Record<string, unknown>)?.type === 'string' &&
        (b as Record<string, unknown>).type === 'text'
    );
    if (!textBlock?.text) return stub.extractFields(input);

    try {
      const parsed = JSON.parse(stripFences(textBlock.text)) as Record<string, unknown>;
      const usageRaw = asRecord((payload as Record<string, unknown>)?.usage);
      return {
        extractedFieldsJson: asRecord(parsed),
        confidenceJson: asNumberRecord(parsed.confidence),
        evidenceJson: asEvidenceRecord(parsed.evidence),
        warningsJson: [],
        modelVersion: this.modelId,
        parserVersion: 'prompt-v1',
        usage: {
          inputTokens: typeof usageRaw.input_tokens === 'number' ? usageRaw.input_tokens : undefined,
          outputTokens: typeof usageRaw.output_tokens === 'number' ? usageRaw.output_tokens : undefined
        }
      };
    } catch {
      return stub.extractFields(input);
    }
  }
}
