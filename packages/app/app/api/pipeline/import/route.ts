import { prisma } from '@/lib/db';
import { err, ok } from '@/lib/api/response';
import { processImportBatch, importSchema } from '@/lib/pipeline/import-service';

function isAuthorized(req: Request): boolean {
  const auth = req.headers.get('authorization');
  return auth === `Bearer ${process.env.MINING_SERVICE_SECRET}`;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) return err('Unauthorized', 'UNAUTHORIZED', 401);

  // NOTE: Intentionally no per-instance in-memory rate limiter.
  // In-memory limits are misleading in multi-instance/serverless deployments because they
  // do not provide consistent cross-instance enforcement. Use edge/proxy-level protection
  // (or a shared Redis limiter) when infrastructure support is available for this app service.

  const body = await req.json();
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    if (body?.events?.length > 50) {
      return err('Batch too large', 'BATCH_TOO_LARGE', 400);
    }
    return err('Invalid payload', 'VALIDATION_ERROR', 400);
  }

  const result = await processImportBatch(prisma, parsed.data);
  return ok(result);
}
