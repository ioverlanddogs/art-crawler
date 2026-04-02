import type { PrismaClient } from '@/lib/prisma-client';
import { BraveSearchProvider } from './brave';
import { GoogleCseProvider } from './google-cse';
import type { SearchProvider } from './types';

/**
 * Returns the active search provider.
 * Resolution order:
 * 1. SiteSetting search_provider if set and its keys are present
 * 2. Auto-detect: Brave → Google CSE
 * 3. null if no provider is configured
 */
export async function getActiveSearchProvider(
  prisma: PrismaClient
): Promise<SearchProvider | null> {
  const setting = await prisma.siteSetting
    .findUnique({ where: { key: 'search_provider' } })
    .catch(() => null);

  const preferred = setting?.value;

  if (preferred === 'brave') {
    const key = process.env.BRAVE_SEARCH_API_KEY?.trim();
    if (key) return new BraveSearchProvider(key);
  }

  if (preferred === 'google_cse') {
    const key = process.env.GOOGLE_CSE_API_KEY?.trim();
    const id = process.env.GOOGLE_CSE_ID?.trim();
    if (key && id) return new GoogleCseProvider(key, id);
  }

  const braveKey = process.env.BRAVE_SEARCH_API_KEY?.trim();
  if (braveKey) return new BraveSearchProvider(braveKey);

  const cseKey = process.env.GOOGLE_CSE_API_KEY?.trim();
  const cseId = process.env.GOOGLE_CSE_ID?.trim();
  if (cseKey && cseId) return new GoogleCseProvider(cseKey, cseId);

  return null;
}
