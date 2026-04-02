import { requireRole } from '@/lib/auth-guard';
import { authFailure, err } from '@/lib/api/response';
import { prisma } from '@/lib/db';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});

const schema = z.object({
  url: z.string().url(),
  extractedText: z.string().max(8000),
  platformType: z.string().optional(),
  messages: z.array(messageSchema).min(1).max(40),
});

const SYSTEM_PROMPT = `You are an expert data extraction assistant for an arts and culture events platform called Artio.

You have been given the text content of a webpage. Your job is to help the admin understand what data can be extracted from this page and how best to extract it.

You can:
- Describe what type of page this is (event listing, artist profile, gallery info, artwork listing)
- Identify what structured data is present (titles, dates, artist names, venues, descriptions, prices)
- Suggest the best extraction mode: events, artists, artworks, gallery, or auto
- Show a preview of what the extracted JSON would look like
- Explain why certain fields might be missing or have low confidence
- Answer questions about the page content

When showing extraction previews, format them as JSON code blocks.
When recommending an extraction mode, state it clearly as: "Recommended mode: [mode]"
Be concise and practical. The admin will use your guidance to decide how to process this URL.`;

async function getProviderSettings(): Promise<{ provider: string; model: string | null }> {
  const [providerSetting, modelSetting] = await Promise.all([
    prisma.siteSetting.findUnique({ where: { key: 'ai_extraction_provider' } }).catch(() => null),
    prisma.siteSetting.findUnique({ where: { key: 'ai_extraction_model' } }).catch(() => null),
  ]);

  return {
    provider: providerSetting?.value ?? 'anthropic',
    model: modelSetting?.value ?? null,
  };
}

function getDefaultModel(provider: string): string {
  if (provider === 'openai') return 'gpt-4o-mini';
  if (provider === 'gemini') return 'gemini-1.5-flash';
  return 'claude-haiku-4-5-20251001';
}

async function streamAnthropic(params: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<ReadableStream> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': params.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: params.model,
      max_tokens: 1024,
      stream: true,
      system: params.systemPrompt,
      messages: params.messages,
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Anthropic streaming failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  return new ReadableStream({
    async start(controller) {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter((line) => line.trim());

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data) as Record<string, unknown>;
              const type = parsed.type as string;

              if (type === 'content_block_delta') {
                const delta = (parsed.delta as Record<string, unknown>)?.text as string;
                if (delta) {
                  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ text: delta })}\n\n`));
                }
              }

              if (type === 'message_stop') {
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ done: true })}\n\n`));
              }
            } catch {
              // skip malformed lines
            }
          }
        }
      } finally {
        controller.close();
      }
    },
  });
}

async function streamOpenAI(params: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<ReadableStream> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: params.model,
      max_tokens: 1024,
      stream: true,
      messages: [{ role: 'system', content: params.systemPrompt }, ...params.messages],
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`OpenAI streaming failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  return new ReadableStream({
    async start(controller) {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter((line) => line.trim());

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);
            if (data === '[DONE]') {
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ done: true })}\n\n`));
              continue;
            }

            try {
              const parsed = JSON.parse(data) as Record<string, unknown>;
              const choices = parsed.choices as Array<Record<string, unknown>>;
              const delta = choices?.[0]?.delta as Record<string, unknown>;
              const text = delta?.content as string;
              if (text) {
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ text })}\n\n`));
              }
            } catch {
              // skip malformed lines
            }
          }
        }
      } finally {
        controller.close();
      }
    },
  });
}

async function streamGemini(params: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<ReadableStream> {
  const contents = params.messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:streamGenerateContent?key=${params.apiKey}&alt=sse`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: params.systemPrompt }] },
      contents,
      generationConfig: { maxOutputTokens: 1024 },
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Gemini streaming failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  return new ReadableStream({
    async start(controller) {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ done: true })}\n\n`));
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter((line) => line.trim());

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);

            try {
              const parsed = JSON.parse(data) as Record<string, unknown>;
              const candidates = parsed.candidates as Array<Record<string, unknown>>;
              const parts = (candidates?.[0]?.content as Record<string, unknown>)?.parts as Array<Record<string, unknown>>;
              const text = parts?.[0]?.text as string;
              if (text) {
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ text })}\n\n`));
              }
            } catch {
              // skip malformed lines
            }
          }
        }
      } finally {
        controller.close();
      }
    },
  });
}

export async function POST(req: Request) {
  try {
    await requireRole(['operator', 'admin']);
  } catch (error) {
    return authFailure(error);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err('Invalid payload', 'VALIDATION_ERROR', 400);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return err('Invalid chat payload', 'VALIDATION_ERROR', 400);
  }

  const { url, extractedText, platformType, messages } = parsed.data;

  const { provider, model } = await getProviderSettings();
  const modelId = model ?? getDefaultModel(provider);

  const systemWithContext = `${SYSTEM_PROMPT}

---
PAGE CONTEXT:
URL: ${url}
Platform: ${platformType ?? 'unknown'}
---
PAGE TEXT (first 8000 chars):
${extractedText}
---`;

  const apiKey =
    provider === 'openai'
      ? process.env.OPENAI_API_KEY
      : provider === 'gemini'
        ? process.env.GEMINI_API_KEY
        : process.env.ANTHROPIC_API_KEY;

  if (!apiKey?.trim()) {
    return err(
      `No API key configured for provider: ${provider}. Add the key in Vercel environment variables.`,
      'NO_API_KEY',
      503,
    );
  }

  try {
    let stream: ReadableStream;

    if (provider === 'openai') {
      stream = await streamOpenAI({
        apiKey: apiKey.trim(),
        model: modelId,
        systemPrompt: systemWithContext,
        messages,
      });
    } else if (provider === 'gemini') {
      stream = await streamGemini({
        apiKey: apiKey.trim(),
        model: modelId,
        systemPrompt: systemWithContext,
        messages,
      });
    } else {
      stream = await streamAnthropic({
        apiKey: apiKey.trim(),
        model: modelId,
        systemPrompt: systemWithContext,
        messages,
      });
    }

    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      },
    });
  } catch (error: unknown) {
    return err(error instanceof Error ? error.message : 'Streaming failed', 'STREAM_ERROR', 500);
  }
}
