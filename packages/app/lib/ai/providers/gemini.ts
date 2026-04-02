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

export class GeminiProvider implements AiExtractionProvider {
  readonly name = 'gemini' as const;
  readonly modelId = 'gemini-1.5-flash';

  constructor(private readonly apiKey: string) {}

  async extractFields(input: {
    extractedText: string;
    sourceUrl: string;
  }): Promise<AiExtractionResult> {
    const stub = new StubProvider();

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelId}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text:
                  'You are a structured data extraction assistant for an arts and culture events platform. Extract event data from the provided page text and return ONLY a JSON object with no preamble or markdown.\n\n' +
                  buildExtractionPrompt(input)
              }
            ]
          }
        ],
        generationConfig: { maxOutputTokens: 1024 }
      })
    }).catch(() => null);

    if (!response || !response.ok) return stub.extractFields(input);

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return stub.extractFields(input);
    }

    const candidates = Array.isArray((payload as Record<string, unknown>)?.candidates)
      ? ((payload as Record<string, unknown>).candidates as unknown[])
      : [];
    const parts = Array.isArray(asRecord(asRecord(candidates[0])?.content)?.parts)
      ? (asRecord(asRecord(candidates[0])?.content).parts as unknown[])
      : [];
    const text = typeof asRecord(parts[0])?.text === 'string' ? (asRecord(parts[0]).text as string) : null;

    if (!text) return stub.extractFields(input);

    try {
      const parsed = JSON.parse(stripFences(text)) as Record<string, unknown>;
      const meta = asRecord((payload as Record<string, unknown>)?.usageMetadata);
      return {
        extractedFieldsJson: asRecord(parsed),
        confidenceJson: asNumberRecord(parsed.confidence),
        evidenceJson: asEvidenceRecord(parsed.evidence),
        warningsJson: [],
        modelVersion: this.modelId,
        parserVersion: 'prompt-v1',
        usage: {
          inputTokens: typeof meta.promptTokenCount === 'number' ? meta.promptTokenCount : undefined,
          outputTokens: typeof meta.candidatesTokenCount === 'number' ? meta.candidatesTokenCount : undefined
        }
      };
    } catch {
      return stub.extractFields(input);
    }
  }
}
