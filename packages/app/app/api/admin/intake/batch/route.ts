import { z } from 'zod';
import { authFailure, err } from '@/lib/api/response';
import { requireRole } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { runIntake } from '@/lib/intake/intake-service';
import { analyseBatchUrls, parseUrlLines } from '@/lib/admin/batch-workflows';

const schema = z.object({
  urls: z.array(z.string()).optional(),
  urlList: z.string().optional(),
  sourceLabel: z.string().max(200).optional(),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  reviewerId: z.string().min(1).optional(),
  dryRun: z.boolean().default(false)
});

export async function POST(request: Request) {
  let session;
  try {
    session = await requireRole(['operator', 'admin']);
  } catch (error) {
    return authFailure(error);
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return err('Invalid payload', 'VALIDATION_ERROR', 400);
  }

  const submittedUrls = [...(parsed.data.urls ?? []), ...parseUrlLines(parsed.data.urlList)];
  if (submittedUrls.length === 0) {
    return err('Provide at least one URL.', 'VALIDATION_ERROR', 400);
  }

  const existingRows = await prisma.sourceDocument.findMany({
    where: { sourceUrl: { in: submittedUrls } },
    select: { sourceUrl: true }
  });

  const analysis = analyseBatchUrls(submittedUrls, existingRows.map((row) => row.sourceUrl));

  if (parsed.data.dryRun) {
    return Response.json({
      dryRun: true,
      sourceLabel: parsed.data.sourceLabel ?? null,
      priority: parsed.data.priority,
      reviewerId: parsed.data.reviewerId ?? null,
      ...analysis
    });
  }

  const queued = [] as Array<{ sourceUrl: string; ingestionJobId: string; status: string }>;
  for (const sourceUrl of analysis.validUrls) {
    const result = await runIntake(
      prisma,
      {
        sourceUrl,
        sourceLabel: parsed.data.sourceLabel,
        notes: `batch_priority=${parsed.data.priority}${parsed.data.reviewerId ? ` reviewer=${parsed.data.reviewerId}` : ''}`
      },
      session.user.id
    );

    queued.push({
      sourceUrl,
      ingestionJobId: result.ingestionJobId,
      status: result.finalStatus
    });
  }

  return Response.json({
    dryRun: false,
    sourceLabel: parsed.data.sourceLabel ?? null,
    priority: parsed.data.priority,
    reviewerId: parsed.data.reviewerId ?? null,
    ...analysis,
    queued
  });
}
