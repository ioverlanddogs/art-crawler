export interface SearchResult {
  url: string;
  title: string;
  description: string;
  domain: string;
}

export interface SearchProvider {
  readonly name: 'brave' | 'google_cse';
  search(query: string, maxResults: number): Promise<SearchResult[]>;
}
