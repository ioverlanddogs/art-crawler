import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth-guard';
import { authFailure, err } from '@/lib/api/response';
import { parsePagination } from '@/lib/api/pagination';
import { IngestionJobStatus } from '@/lib/prisma-client';
import { runIntake } from '@/lib/intake/intake-service';
import { intakeSubmitSchema } from '@/lib/intake/validate';

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

  const parsed = intakeSubmitSchema.safeParse(body);
  if (!parsed.success) {
    return err('Invalid payload', 'VALIDATION_ERROR', 400);
  }

  const result = await runIntake(prisma, parsed.data, session.user.id);
  return Response.json(result, { status: 201 });
}

export async function GET(req: Request) {
  try {
    await requireRole(['viewer', 'moderator', 'operator', 'admin']);
  } catch (error) {
    return authFailure(error);
  }

  const url = new URL(req.url);
  const { page, pageSize, skip, take } = parsePagination(url.searchParams);
  const statusParam = url.searchParams.get('status');

  const status =
    statusParam && statusParam in IngestionJobStatus
      ? IngestionJobStatus[statusParam as keyof typeof IngestionJobStatus]
      : undefined;

  const where = status ? { status } : undefined;

  const [total, data] = await Promise.all([
    prisma.ingestionJob.count({ where }),
    prisma.ingestionJob.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        sourceDocument: {
          select: {
            sourceUrl: true,
            fingerprint: true
          }
        }
      }
    })
  ]);

  return Response.json({ data, meta: { page, pageSize, total } });
}
