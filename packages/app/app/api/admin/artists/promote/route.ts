import { requireRole } from '@/lib/auth-guard';
import { authFailure, err, ok } from '@/lib/api/response';
import { prisma } from '@/lib/db';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const schema = z.object({
  ingestExtractedArtistId: z.string().min(1),
  overrides: z.object({
    name: z.string().optional(),
    bio: z.string().optional(),
    nationality: z.string().optional(),
    birthYear: z.number().int().optional(),
    medium: z.string().optional(),
    websiteUrl: z.string().optional(),
    instagramUrl: z.string().optional(),
    imageUrl: z.string().optional()
  }).optional()
});

function slugify(name: string): string {
  return name
    .toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

export async function POST(req: Request) {
  try {
    await requireRole(['admin']);
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
    return err('ingestExtractedArtistId is required', 'VALIDATION_ERROR', 400);
  }

  const extracted = await prisma.ingestExtractedArtist.findUnique({
    where: { id: parsed.data.ingestExtractedArtistId }
  });

  if (!extracted) {
    return err('IngestExtractedArtist not found', 'NOT_FOUND', 404);
  }

  if (extracted.status !== 'PENDING' && extracted.status !== 'APPROVED') {
    return err(
      `Cannot promote an artist with status: ${extracted.status}`,
      'INVALID_STATUS',
      409
    );
  }

  const overrides = parsed.data.overrides ?? {};
  const name = String(overrides.name ?? extracted.name);
  const baseSlug = slugify(name);

  let slug = baseSlug;
  let suffix = 1;
  while (await prisma.artist.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
    if (suffix > 10) break;
  }
  if (suffix > 10 && await prisma.artist.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`;
  }

  const artist = await prisma.artist.create({
    data: {
      name,
      slug,
      bio: overrides.bio ?? null,
      nationality: overrides.nationality ?? null,
      birthYear: overrides.birthYear ?? null,
      medium: overrides.medium ?? null,
      websiteUrl: overrides.websiteUrl ?? null,
      instagramUrl: overrides.instagramUrl ?? null,
      imageUrl: overrides.imageUrl ?? null
    }
  });

  await prisma.ingestExtractedArtist.update({
    where: { id: extracted.id },
    data: { status: 'APPROVED', moderatedAt: new Date() }
  });

  return ok({ artist, promoted: true });
}
