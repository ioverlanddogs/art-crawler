import { z } from 'zod';
import { requireRole } from '@/lib/auth-guard';
import { authFailure, err } from '@/lib/api/response';
import { fetchSource } from '@/lib/intake/fetch-source';
import { detectPlatform } from '@/lib/intake/platform-detector';

export const dynamic = 'force-dynamic';

const schema = z.object({
  urls: z.array(z.string().url()).min(1).max(10)
});

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
    return err('urls must be an array of 1–10 valid URLs', 'VALIDATION_ERROR', 400);
  }

  const results = await Promise.all(
    parsed.data.urls.map(async (url) => {
      try {
        const fetchResult = await fetchSource(url);
        if (fetchResult.error) {
          return { url, error: fetchResult.error, platformType: null, requiresJs: false, title: null };
        }
        const detection = detectPlatform({ url: fetchResult.finalUrl, html: fetchResult.rawHtml });

        const titleMatch = fetchResult.rawHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
        const pageTitle = titleMatch?.[1]?.trim() ?? null;

        return {
          url: fetchResult.finalUrl,
          httpStatus: fetchResult.httpStatus,
          platformType: detection.platformType,
          platformConfidence: detection.confidence,
          requiresJs: detection.requiresJs,
          signals: detection.signals,
          title: pageTitle,
          extractedTextLength: fetchResult.extractedText.length,
          error: null
        };
      } catch (error: unknown) {
        return {
          url,
          error: error instanceof Error ? error.message : 'unknown_error',
          platformType: null,
          requiresJs: false,
          title: null
        };
      }
    })
  );

  return Response.json({ results });
}
