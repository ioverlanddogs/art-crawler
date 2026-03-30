import { prisma } from '@/lib/db';
import { err, ok } from '@/lib/api/response';
import { processImportBatch, importSchema } from '@/lib/pipeline/import-service';

const requestsByIp = new Map<string, number[]>();

function isAuthorized(req: Request): boolean {
  const auth = req.headers.get('authorization');
  return auth === `Bearer ${process.env.MINING_SERVICE_SECRET}`;
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const requests = requestsByIp.get(ip)?.filter((ts) => ts > oneHourAgo) ?? [];
  if (requests.length >= 10) {
    requestsByIp.set(ip, requests);
    return false;
  }
  requests.push(now);
  requestsByIp.set(ip, requests);
  return true;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) return err('Unauthorized', 'UNAUTHORIZED', 401);

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!checkRateLimit(ip)) return err('Rate limit exceeded', 'RATE_LIMITED', 429);

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
