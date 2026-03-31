import { z } from 'zod';
import type { Prisma } from '../../../../../../generated/prisma';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth-guard';
import { authFailure, err, ok } from '@/lib/api/response';

const schema = z.object({ ids: z.array(z.string()).min(1) });

export async function POST(req: Request) {
  let session;
  try {
    session = await requireRole(['operator', 'admin']);
  } catch (error) {
    return authFailure(error);
  }

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return err('Invalid payload', 'VALIDATION_ERROR', 400);

  const succeeded: string[] = [];
  const failed: string[] = [];

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    for (const id of parsed.data.ids) {
      const existing = await tx.ingestExtractedEvent.findUnique({ where: { id } });
      if (!existing) {
        failed.push(id);
        continue;
      }

      await tx.ingestExtractedEvent.update({
        where: { id },
        data: { status: 'APPROVED', moderatedBy: session.user.id, moderatedAt: new Date() }
      });
      succeeded.push(id);
    }
  });

  return ok({ succeeded, failed });
}
