import { requireRole } from '@/lib/auth-guard';
import { authFailure, err } from '@/lib/api/response';
import { prisma } from '@/lib/db';
import { getActiveExtractionProvider } from '@/lib/ai/provider-selector';
import { buildExtractionPrompt } from '@/lib/ai/prompt';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const schema = z.object({
  url: z.string().url(),
  extractedText: z.string().max(8000),
  mode: z.enum(['events', 'artists', 'artworks', 'gallery', 'auto']).default('events'),
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
    return err('url, extractedText, and a valid mode are required', 'VALIDATION_ERROR', 400);
  }

  void buildExtractionPrompt;
  const provider = await getActiveExtractionProvider(prisma);

  const result = await provider.extractFields({
    extractedText: parsed.data.extractedText,
    sourceUrl: parsed.data.url,
    mode: parsed.data.mode,
  });

  return Response.json({
    extractedFields: result.extractedFieldsJson,
    confidence: result.confidenceJson,
    evidence: result.evidenceJson,
    warnings: result.warningsJson,
    modelVersion: result.modelVersion,
    parserVersion: result.parserVersion,
    mode: parsed.data.mode,
  });
}
