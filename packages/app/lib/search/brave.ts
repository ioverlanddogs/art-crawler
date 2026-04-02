import type { SearchProvider, SearchResult } from './types';

export class BraveSearchProvider implements SearchProvider {
  readonly name = 'brave' as const;

  constructor(private readonly apiKey: string) {}

  async search(query: string, maxResults: number): Promise<SearchResult[]> {
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(Math.min(maxResults, 20)));

    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': this.apiKey
      }
    }).catch(() => null);

    if (!response?.ok) return [];

    const payload = await response.json().catch(() => null);
    if (!payload) return [];

    const results = Array.isArray(payload?.web?.results) ? payload.web.results : [];

    return results
      .slice(0, maxResults)
      .map((r: unknown) => {
        const item = r as Record<string, unknown>;
        const rawUrl = typeof item.url === 'string' ? item.url : '';
        let domain = '';
        try {
          domain = new URL(rawUrl).hostname;
        } catch {
          domain = '';
        }
        return {
          url: rawUrl,
          title: typeof item.title === 'string' ? item.title : '',
          description: typeof item.description === 'string' ? item.description : '',
          domain
        };
      })
      .filter((r: SearchResult) => r.url.length > 0);
  }
}
