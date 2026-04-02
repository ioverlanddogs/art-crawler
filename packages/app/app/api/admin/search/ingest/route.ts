import { z } from 'zod';
import { authFailure, err } from '@/lib/api/response';
import { requireRole } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { runIntake } from '@/lib/intake/intake-service';

export const dynamic = 'force-dynamic';

const schema = z.object({
  urls: z.array(z.string().url()).min(1).max(20)
});

export async function POST(req: Request) {
  let session;
  try {
    session = await requireRole(['operator', 'admin']);
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
    return err('urls must be an array of 1–20 valid URLs', 'VALIDATION_ERROR', 400);
  }

  const results: Array<{
    url: string;
    status: 'queued' | 'error';
    jobId?: string;
    error?: string;
  }> = [];

  for (const url of parsed.data.urls) {
    try {
      const result = await runIntake(prisma, { sourceUrl: url }, session.user.id);
      results.push({ url, status: 'queued', jobId: result.ingestionJobId });
    } catch (error: unknown) {
      results.push({
        url,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  const queued = results.filter((r) => r.status === 'queued').length;
  const errors = results.filter((r) => r.status === 'error').length;

  return Response.json({ queued, errors, results });
}
