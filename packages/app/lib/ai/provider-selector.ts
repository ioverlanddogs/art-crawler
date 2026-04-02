import type { PrismaClient } from '@/lib/prisma-client';
import type { AiExtractionProvider } from './types';
import { AnthropicProvider } from './providers/anthropic';
import { OpenAIProvider } from './providers/openai';
import { GeminiProvider } from './providers/gemini';
import { StubProvider } from './stub-provider';

export type ProviderName = 'anthropic' | 'openai' | 'gemini';

export const PROVIDER_MODELS: Record<ProviderName, { id: string; label: string }[]> = {
  anthropic: [
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku (fast, cheap)' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet (balanced)' },
    { id: 'claude-opus-4-6', label: 'Claude Opus (most capable)' }
  ],
  openai: [
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini (fast, cheap)' },
    { id: 'gpt-4o', label: 'GPT-4o (balanced)' },
    { id: 'gpt-4-turbo', label: 'GPT-4 Turbo (powerful)' }
  ],
  gemini: [
    { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (fast, cheap)' },
    { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro (balanced)' },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (latest)' }
  ]
};

export function getDefaultModel(name: ProviderName): string {
  return PROVIDER_MODELS[name][0].id;
}

function getEnvKey(name: ProviderName): string | undefined {
  if (name === 'anthropic') return process.env.ANTHROPIC_API_KEY;
  if (name === 'openai') return process.env.OPENAI_API_KEY;
  if (name === 'gemini') return process.env.GEMINI_API_KEY;
  return undefined;
}

function buildProvider(name: ProviderName, apiKey: string, modelId?: string): AiExtractionProvider {
  const model = modelId?.trim() || getDefaultModel(name);
  if (name === 'openai') return new OpenAIProvider(apiKey, model);
  if (name === 'gemini') return new GeminiProvider(apiKey, model);
  return new AnthropicProvider(apiKey, model);
}

function isValidProviderName(value: string): value is ProviderName {
  return value === 'anthropic' || value === 'openai' || value === 'gemini';
}


function isKnownModelForProvider(name: ProviderName, modelId: string | null | undefined): modelId is string {
  if (!modelId) return false;
  return PROVIDER_MODELS[name].some((model) => model.id === modelId);
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
  const [providerSetting, modelSetting] = await Promise.all([
    prisma.siteSetting.findUnique({ where: { key: 'ai_extraction_provider' } }).catch(() => null),
    prisma.siteSetting.findUnique({ where: { key: 'ai_extraction_model' } }).catch(() => null)
  ]);

  const preferred = providerSetting?.value;
  const preferredModel = modelSetting?.value;

  if (preferred && isValidProviderName(preferred)) {
    const apiKey = getEnvKey(preferred);
    const model = isKnownModelForProvider(preferred, preferredModel) ? preferredModel : undefined;
    if (apiKey?.trim()) return buildProvider(preferred, apiKey.trim(), model);
  }

  // Auto-detect fallback — use preferred model only if it matches this provider
  const order: ProviderName[] = ['anthropic', 'openai', 'gemini'];
  for (const name of order) {
    const apiKey = getEnvKey(name);
    if (apiKey?.trim()) return buildProvider(name, apiKey.trim());
  }

  return new StubProvider();
}
