const MAX_REDIRECTS = 5;
const MAX_BODY_LENGTH = 5_000_000;

export interface FetchResult {
  finalUrl: string;
  httpStatus: number;
  contentType: string | null;
  rawHtml: string;
  extractedText: string;
  fetchedAt: Date;
  error?: string;
}

function stripHtml(rawHtml: string): string {
  return rawHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function fetchSource(url: string): Promise<FetchResult> {
  let currentUrl = url;

  try {
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      const response = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'user-agent': 'ArtioAdminBot/1.0'
        }
      });

      const isRedirect = response.status >= 300 && response.status < 400;
      if (!isRedirect) {
        const rawHtml = await response.text();
        if (rawHtml.length > MAX_BODY_LENGTH) {
          return {
            finalUrl: currentUrl,
            httpStatus: response.status,
            contentType: response.headers.get('content-type'),
            rawHtml: '',
            extractedText: '',
            fetchedAt: new Date(),
            error: 'response_too_large'
          };
        }

        return {
          finalUrl: currentUrl,
          httpStatus: response.status,
          contentType: response.headers.get('content-type'),
          rawHtml,
          extractedText: stripHtml(rawHtml),
          fetchedAt: new Date()
        };
      }

      const location = response.headers.get('location');
      if (!location) {
        return {
          finalUrl: currentUrl,
          httpStatus: response.status,
          contentType: response.headers.get('content-type'),
          rawHtml: '',
          extractedText: '',
          fetchedAt: new Date(),
          error: 'redirect_missing_location'
        };
      }

      currentUrl = new URL(location, currentUrl).toString();
    }

    return {
      finalUrl: currentUrl,
      httpStatus: 0,
      contentType: null,
      rawHtml: '',
      extractedText: '',
      fetchedAt: new Date(),
      error: 'redirect_limit_exceeded'
    };
  } catch (error: unknown) {
    return {
      finalUrl: currentUrl,
      httpStatus: 0,
      contentType: null,
      rawHtml: '',
      extractedText: '',
      fetchedAt: new Date(),
      error: error instanceof Error ? error.message : 'fetch_error'
    };
  }
}
