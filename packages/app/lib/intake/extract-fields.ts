import { getAnthropicApiKey } from '@/lib/env';

export interface ExtractionResult {
  extractedFieldsJson: Record<string, unknown>;
  confidenceJson: Record<string, number>;
  evidenceJson: Record<string, string[]>;
  warningsJson: string[];
  modelVersion: string;
  parserVersion: string;
}

type AnthropicUsage = {
  input_tokens?: number;
  output_tokens?: number;
};

export async function extractFields(sourceDocument: {
  extractedText: string;
  sourceUrl: string;
}): Promise<ExtractionResult> {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) {
    return buildStubResult(sourceDocument, ['anthropic_api_key_missing']);
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system:
        'You are a structured data extraction assistant for an arts and culture events platform. Extract event data from the provided page text and return ONLY a JSON object with no preamble or markdown.',
      messages: [
        {
          role: 'user',
          content: buildUserPrompt({
            sourceUrl: sourceDocument.sourceUrl,
            extractedText: sourceDocument.extractedText.slice(0, 4000)
          })
        }
      ]
    })
  }).catch(() => null);

  if (!response || !response.ok) {
    return buildStubResult(sourceDocument, ['ai_parse_error']);
  }

  let payload: any;
  try {
    payload = await response.json();
  } catch {
    return buildStubResult(sourceDocument, ['ai_parse_error']);
  }

  const text = extractMessageText(payload);
  if (!text) {
    return buildStubResult(sourceDocument, ['ai_parse_error']);
  }

  try {
    const parsed = JSON.parse(stripMarkdownCodeFences(text)) as Record<string, unknown>;
    const result: ExtractionResult & {
      usage?: { inputTokens?: number; outputTokens?: number };
    } = {
      extractedFieldsJson: asRecord(parsed),
      confidenceJson: asNumberRecord(parsed.confidence),
      evidenceJson: asEvidenceRecord(parsed.evidence),
      warningsJson: [],
      modelVersion: 'claude-haiku-4-5-20251001',
      parserVersion: 'prompt-v1',
      usage: {
        inputTokens: asUsage(payload.usage).input_tokens,
        outputTokens: asUsage(payload.usage).output_tokens
      }
    };
    return result;
  } catch {
    return buildStubResult(sourceDocument, ['ai_parse_error']);
  }
}

function buildUserPrompt(input: { sourceUrl: string; extractedText: string }) {
  return `Extract structured event data from this page.\n\nSource URL: ${input.sourceUrl}\nPage text:\n${input.extractedText}\n\nReturn a JSON object with these fields (omit fields you cannot find):\n{\n  "title": "string — event or exhibition title",\n  "startAt": "ISO 8601 datetime or date",\n  "endAt": "ISO 8601 datetime or date (if applicable)",\n  "timezone": "IANA timezone name if found",\n  "locationText": "venue name and/or address",\n  "description": "brief event description (max 300 chars)",\n  "artistNames": ["array of artist or performer names"],\n  "imageUrl": "URL of a representative image if found in the text"\n}\n\nFor each field you return, also return a confidence object:\n{\n  "confidence": {\n    "title": 0.0-1.0,\n    ...\n  }\n}\n\nAnd an evidence object with the sentence or phrase that supports each field:\n{\n  "evidence": {\n    "title": "the supporting text snippet",\n    ...\n  }\n}`;
}

function buildStubResult(sourceDocument: { extractedText: string; sourceUrl: string }, warningsJson: string[]): ExtractionResult {
  const titleMatch = sourceDocument.extractedText.match(/<title[^>]*>(.*?)<\/title>/i);
  const fallbackTitle = new URL(sourceDocument.sourceUrl).hostname;
  const title = titleMatch?.[1]?.trim() || fallbackTitle;

  return {
    extractedFieldsJson: {
      title
    },
    confidenceJson: {
      title: 0.4
    },
    evidenceJson: {
      title: []
    },
    warningsJson,
    modelVersion: 'stub-v0',
    parserVersion: 'regex-v0'
  };
}

function stripMarkdownCodeFences(value: string): string {
  return value
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function extractMessageText(payload: any): string | null {
  const firstBlock = Array.isArray(payload?.content) ? payload.content.find((entry: any) => entry?.type === 'text') : null;
  return typeof firstBlock?.text === 'string' ? firstBlock.text : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asNumberRecord(value: unknown): Record<string, number> {
  const record = asRecord(value);
  return Object.fromEntries(Object.entries(record).filter(([, candidate]) => typeof candidate === 'number')) as Record<string, number>;
}

function asEvidenceRecord(value: unknown): Record<string, string[]> {
  const record = asRecord(value);
  return Object.fromEntries(
    Object.entries(record).map(([key, candidate]) => {
      if (Array.isArray(candidate)) {
        return [key, candidate.filter((entry): entry is string => typeof entry === 'string')];
      }
      if (typeof candidate === 'string') {
        return [key, [candidate]];
      }
      return [key, []];
    })
  );
}

function asUsage(value: unknown): AnthropicUsage {
  const usage = asRecord(value);
  return {
    input_tokens: typeof usage.input_tokens === 'number' ? usage.input_tokens : undefined,
    output_tokens: typeof usage.output_tokens === 'number' ? usage.output_tokens : undefined
  };
}
