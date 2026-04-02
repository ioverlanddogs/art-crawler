/**
 * Mining-service AI extractor.
 * Provider priority: ANTHROPIC_API_KEY → OPENAI_API_KEY → GEMINI_API_KEY.
 * Falls back to empty object {} when no key is available so the pipeline continues.
 * Mining has no access to the app SiteSetting DB — selection is env-var-only.
 */
import { getMiningAnthropicApiKey, getMiningOpenAiApiKey, getMiningGeminiApiKey } from './env.js';

const EXTRACTION_PROMPT = `Extract structured event data from this page HTML. Return ONLY a JSON object with no preamble or markdown.

Fields to extract (omit fields you cannot find):
{
  "title": "event or exhibition title",
  "startAt": "ISO 8601 datetime or date",
  "endAt": "ISO 8601 datetime or date (if applicable)",
  "timezone": "IANA timezone name if found",
  "locationText": "venue name and/or address",
  "description": "brief description (max 300 chars)",
  "artistNames": ["array of artist or performer names"],
  "imageUrl": "URL of a representative image if found"
}`;

function stripFences(value: string): string {
  return value.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

async function extractWithAnthropic(apiKey: string, html: string): Promise<Record<string, unknown>> {
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
      system: 'You are a structured data extraction assistant for an arts and culture events platform.',
      messages: [{ role: 'user', content: `${EXTRACTION_PROMPT}\n\nHTML:\n${html}` }]
    })
  }).catch(() => null);

  if (!response?.ok) return {};
  const payload = await response.json().catch(() => null);
  if (!payload) return {};
  const content = Array.isArray(payload?.content) ? payload.content : [];
  const textBlock = content.find((b: unknown) => asRecord(b).type === 'text');
  const text = typeof asRecord(textBlock).text === 'string' ? asRecord(textBlock).text as string : null;
  if (!text) return {};
  try { return asRecord(JSON.parse(stripFences(text))); } catch { return {}; }
}

async function extractWithOpenAI(apiKey: string, html: string): Promise<Record<string, unknown>> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 1024,
      messages: [
        { role: 'system', content: 'You are a structured data extraction assistant for an arts and culture events platform.' },
        { role: 'user', content: `${EXTRACTION_PROMPT}\n\nHTML:\n${html}` }
      ]
    })
  }).catch(() => null);

  if (!response?.ok) return {};
  const payload = await response.json().catch(() => null);
  if (!payload) return {};
  const choices = Array.isArray(payload?.choices) ? payload.choices : [];
  const text = typeof asRecord(asRecord(choices[0])?.message)?.content === 'string'
    ? asRecord(asRecord(choices[0])?.message).content as string : null;
  if (!text) return {};
  try { return asRecord(JSON.parse(stripFences(text))); } catch { return {}; }
}

async function extractWithGemini(apiKey: string, html: string): Promise<Record<string, unknown>> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${EXTRACTION_PROMPT}\n\nHTML:\n${html}` }] }],
      generationConfig: { maxOutputTokens: 1024 }
    })
  }).catch(() => null);

  if (!response?.ok) return {};
  const payload = await response.json().catch(() => null);
  if (!payload) return {};
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  const parts = Array.isArray(asRecord(asRecord(candidates[0])?.content)?.parts)
    ? asRecord(asRecord(candidates[0])?.content).parts as unknown[] : [];
  const text = typeof asRecord(parts[0])?.text === 'string' ? asRecord(parts[0]).text as string : null;
  if (!text) return {};
  try { return asRecord(JSON.parse(stripFences(text))); } catch { return {}; }
}

export function createMiningAiExtractor() {
  return {
    async extract(html: string): Promise<Record<string, unknown>> {
      const truncated = html.slice(0, 8000);

      const anthropicKey = getMiningAnthropicApiKey();
      if (anthropicKey?.trim()) {
        const result = await extractWithAnthropic(anthropicKey.trim(), truncated);
        if (Object.keys(result).length > 0) return result;
      }

      const openAiKey = getMiningOpenAiApiKey();
      if (openAiKey?.trim()) {
        const result = await extractWithOpenAI(openAiKey.trim(), truncated);
        if (Object.keys(result).length > 0) return result;
      }

      const geminiKey = getMiningGeminiApiKey();
      if (geminiKey?.trim()) {
        const result = await extractWithGemini(geminiKey.trim(), truncated);
        if (Object.keys(result).length > 0) return result;
      }

      console.warn('[mining:extract] no AI key configured — returning empty extraction');
      return {};
    }
  };
}
