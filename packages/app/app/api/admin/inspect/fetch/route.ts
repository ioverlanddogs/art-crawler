import { requireRole } from '@/lib/auth-guard';
import { authFailure, err } from '@/lib/api/response';
import { fetchSource } from '@/lib/intake/fetch-source';
import { detectPlatform } from '@/lib/intake/platform-detector';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const schema = z.object({
  url: z.string().url(),
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
    return err('A valid URL is required', 'VALIDATION_ERROR', 400);
  }

  const fetchResult = await fetchSource(parsed.data.url);

  if (fetchResult.error) {
    return err(`Failed to fetch URL: ${fetchResult.error}`, 'FETCH_ERROR', 422);
  }

  const detection = detectPlatform({
    url: fetchResult.finalUrl,
    html: fetchResult.rawHtml,
  });

  return Response.json({
    url: fetchResult.finalUrl,
    httpStatus: fetchResult.httpStatus,
    contentType: fetchResult.contentType,
    extractedText: fetchResult.extractedText.slice(0, 8000),
    rawHtmlLength: fetchResult.rawHtml.length,
    platformType: detection.platformType,
    requiresJs: detection.requiresJs,
    platformConfidence: detection.confidence,
    platformSignals: detection.signals,
    fetchedAt: fetchResult.fetchedAt,
  });
}
