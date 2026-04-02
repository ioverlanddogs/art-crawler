import { requireRole } from '@/lib/auth-guard';
import { authFailure, err } from '@/lib/api/response';
import { prisma } from '@/lib/db';
import { runIntake } from '@/lib/intake/intake-service';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const schema = z.object({
  url: z.string().url(),
  mode: z.enum(['events', 'artists', 'artworks', 'gallery', 'auto'])
});

export async function POST(
  req: Request,
  { params }: { params: { venueId: string } }
) {
  let session;
  try {
    session = await requireRole(['operator', 'admin']);
  } catch (error) {
    return authFailure(error);
  }

  const venue = await prisma.venue.findUnique({
    where: { id: params.venueId },
    select: { id: true, name: true }
  });

  if (!venue) {
    return err('Venue not found', 'NOT_FOUND', 404);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err('Invalid payload', 'VALIDATION_ERROR', 400);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return err('url and mode are required', 'VALIDATION_ERROR', 400);
  }

  const result = await runIntake(
    prisma,
    { sourceUrl: parsed.data.url, recordTypeOverride: parsed.data.mode },
    session.user.id
  );

  await prisma.enrichmentRun.create({
    data: {
      entityType: 'Venue',
      entityId: params.venueId,
      template: parsed.data.mode,
      status: 'QUEUED',
      fieldsChanged: [],
      sourceUrl: parsed.data.url,
      metadata: { ingestionJobId: result.ingestionJobId, mode: parsed.data.mode }
    }
  });

  return Response.json({
    ingestionJobId: result.ingestionJobId,
    venueId: params.venueId,
    mode: parsed.data.mode,
    url: parsed.data.url
  });
}
