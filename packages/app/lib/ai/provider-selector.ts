import type { PrismaClient } from '@/lib/prisma-client';
import type { AiExtractionProvider } from './types';
import { AnthropicProvider } from './providers/anthropic';
import { OpenAIProvider } from './providers/openai';
import { GeminiProvider } from './providers/gemini';
import { StubProvider } from './stub-provider';

type ProviderName = 'anthropic' | 'openai' | 'gemini';

function getEnvKey(name: ProviderName): string | undefined {
  if (name === 'anthropic') return process.env.ANTHROPIC_API_KEY;
  if (name === 'openai') return process.env.OPENAI_API_KEY;
  if (name === 'gemini') return process.env.GEMINI_API_KEY;
  return undefined;
}

function buildProvider(name: ProviderName, apiKey: string): AiExtractionProvider {
  if (name === 'openai') return new OpenAIProvider(apiKey);
  if (name === 'gemini') return new GeminiProvider(apiKey);
  return new AnthropicProvider(apiKey);
}

function isValidProviderName(value: string): value is ProviderName {
  return value === 'anthropic' || value === 'openai' || value === 'gemini';
}

/**
 * Returns the active AI extraction provider.
 *
 * Resolution order:
 * 1. DB SiteSetting `ai_extraction_provider` — if set and its API key is present
 * 2. Auto-detect: first of ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY that is set
 * 3. StubProvider — when no key is available
 */
export async function getActiveExtractionProvider(
  prisma: PrismaClient
): Promise<AiExtractionProvider> {
  const setting = await prisma.siteSetting
    .findUnique({ where: { key: 'ai_extraction_provider' } })
    .catch(() => null);

  const preferred = setting?.value;
  if (preferred && isValidProviderName(preferred)) {
    const apiKey = getEnvKey(preferred);
    if (apiKey?.trim()) return buildProvider(preferred, apiKey.trim());
  }

  // Auto-detect fallback
  const order: ProviderName[] = ['anthropic', 'openai', 'gemini'];
  for (const name of order) {
    const apiKey = getEnvKey(name);
    if (apiKey?.trim()) return buildProvider(name, apiKey.trim());
  }

  return new StubProvider();
}
