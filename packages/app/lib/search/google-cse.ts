import type { SearchProvider, SearchResult } from './types';

export class GoogleCseProvider implements SearchProvider {
  readonly name = 'google_cse' as const;

  constructor(
    private readonly apiKey: string,
    private readonly cseId: string
  ) {}

  async search(query: string, maxResults: number): Promise<SearchResult[]> {
    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.set('key', this.apiKey);
    url.searchParams.set('cx', this.cseId);
    url.searchParams.set('q', query);
    url.searchParams.set('num', String(Math.min(maxResults, 10)));

    const response = await fetch(url.toString()).catch(() => null);
    if (!response?.ok) return [];

    const payload = await response.json().catch(() => null);
    if (!payload) return [];

    const items = Array.isArray(payload?.items) ? payload.items : [];

    return items
      .slice(0, maxResults)
      .map((r: unknown) => {
        const item = r as Record<string, unknown>;
        const rawUrl = typeof item.link === 'string' ? item.link : '';
        let domain = '';
        try {
          domain = new URL(rawUrl).hostname;
        } catch {
          domain = '';
        }
        return {
          url: rawUrl,
          title: typeof item.title === 'string' ? item.title : '',
          description: typeof item.snippet === 'string' ? item.snippet : '',
          domain
        };
      })
      .filter((r: SearchResult) => r.url.length > 0);
  }
}
