import type { AiExtractionProvider, AiExtractionResult } from '../types';
import { buildExtractionPrompt } from '../prompt';
import { StubProvider } from '../stub-provider';

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asNumberRecord(value: unknown): Record<string, number> {
  const r = asRecord(value);
  return Object.fromEntries(Object.entries(r).filter(([, v]) => typeof v === 'number')) as Record<string, number>;
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

export class OpenAIProvider implements AiExtractionProvider {
  readonly name = 'openai' as const;
  readonly modelId = 'gpt-4o-mini';

  constructor(private readonly apiKey: string) {}

  async extractFields(input: {
    extractedText: string;
    sourceUrl: string;
  }): Promise<AiExtractionResult> {
    const stub = new StubProvider();

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.modelId,
        max_tokens: 1024,
        messages: [
          {
            role: 'system',
            content:
              'You are a structured data extraction assistant for an arts and culture events platform. Extract event data from the provided page text and return ONLY a JSON object with no preamble or markdown.'
          },
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

    const choices = Array.isArray((payload as Record<string, unknown>)?.choices)
      ? ((payload as Record<string, unknown>).choices as unknown[])
      : [];
    const text =
      typeof asRecord(asRecord(choices[0])?.message)?.content === 'string'
        ? (asRecord(asRecord(choices[0])?.message).content as string)
        : null;

    if (!text) return stub.extractFields(input);

    try {
      const parsed = JSON.parse(stripFences(text)) as Record<string, unknown>;
      const usageRaw = asRecord((payload as Record<string, unknown>)?.usage);
      return {
        extractedFieldsJson: asRecord(parsed),
        confidenceJson: asNumberRecord(parsed.confidence),
        evidenceJson: asEvidenceRecord(parsed.evidence),
        warningsJson: [],
        modelVersion: this.modelId,
        parserVersion: 'prompt-v1',
        usage: {
          inputTokens: typeof usageRaw.prompt_tokens === 'number' ? usageRaw.prompt_tokens : undefined,
          outputTokens: typeof usageRaw.completion_tokens === 'number' ? usageRaw.completion_tokens : undefined
        }
      };
    } catch {
      return stub.extractFields(input);
    }
  }
}
