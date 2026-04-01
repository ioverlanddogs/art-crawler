import { prisma } from '@/lib/db';
import { isPipelineImportAuthorized } from '@/lib/pipeline/import-auth';
import { err } from '@/lib/api/response';
import { processImportBatch, importSchema } from '@/lib/pipeline/import-service';

export async function POST(req: Request) {
  if (!isPipelineImportAuthorized(req)) return err('Unauthorized', 'UNAUTHORIZED', 401);

  const contentLengthHeader = req.headers.get('content-length');
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : 0;
  if (Number.isFinite(contentLength) && contentLength > 512_000) {
    return err('Payload too large', 'TOO_LARGE', 413);
  }

  // NOTE: Intentionally no per-instance in-memory rate limiter.
  // In-memory limits are misleading in multi-instance/serverless deployments because they
  // do not provide consistent cross-instance enforcement. Use edge/proxy-level protection
  // (or a shared Redis limiter) when infrastructure support is available for this app service.
  // TODO: Add Redis-backed rate limiting for consistent multi-instance enforcement.

  const body = await req.json();
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    if (body?.events?.length > 50) {
      return err('Batch too large', 'BATCH_TOO_LARGE', 400);
    }
    return err('Invalid payload', 'VALIDATION_ERROR', 400);
  }

  const result = await processImportBatch(prisma, parsed.data);
  return Response.json(result);
}
