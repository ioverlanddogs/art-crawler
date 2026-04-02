import { z } from 'zod';
import { requireRole } from '@/lib/auth-guard';
import { authFailure, err, ok } from '@/lib/api/response';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const schema = z.object({
  proposedChangeSetId: z.string().min(1),
  overrides: z.object({
    name: z.string().optional(),
    region: z.string().optional(),
    address: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    bio: z.string().optional(),
    openingHours: z.string().optional(),
    websiteUrl: z.string().optional(),
    instagramUrl: z.string().optional(),
    imageUrl: z.string().optional()
  }).optional()
});

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
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
    return err('proposedChangeSetId is required', 'VALIDATION_ERROR', 400);
  }

  const changeSet = await prisma.proposedChangeSet.findUnique({
    where: { id: parsed.data.proposedChangeSetId },
    include: {
      sourceDocument: { select: { sourceUrl: true } }
    }
  });

  if (!changeSet) {
    return err('ProposedChangeSet not found', 'NOT_FOUND', 404);
  }

  if (changeSet.reviewStatus !== 'approved' && changeSet.reviewStatus !== 'in_review') {
    return err(
      `Cannot promote a change set with status: ${changeSet.reviewStatus}. Must be approved or in_review.`,
      'INVALID_STATUS',
      409
    );
  }

  const fields = (changeSet.proposedDataJson ?? {}) as Record<string, unknown>;
  const overrides = parsed.data.overrides ?? {};

  let domain: string | null = null;
  try {
    domain = new URL(changeSet.sourceDocument.sourceUrl).hostname.toLowerCase();
  } catch {
    // ignore
  }

  if (domain) {
    const existing = await prisma.venue.findUnique({ where: { domain } });
    if (existing) {
      return err(
        `A venue with domain ${domain} already exists: ${existing.name} (id: ${existing.id})`,
        'DUPLICATE_VENUE',
        409
      );
    }
  }

  const name = String(overrides.name ?? fields.venueName ?? fields.name ?? 'Unknown Venue');
  const baseSlug = slugify(name);

  let slug = baseSlug;
  let suffix = 1;
  while (await prisma.venue.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
    if (suffix > 10) break;
  }

  if (suffix > 10 && await prisma.venue.findUnique({ where: { slug } })) {
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    slug = `${baseSlug}-${randomSuffix}`;
  }

  const venue = await prisma.venue.create({
    data: {
      name,
      slug,
      domain: domain ?? undefined,
      region: String(overrides.region ?? fields.region ?? ''),
      address: String(overrides.address ?? fields.address ?? ''),
      phone: typeof (overrides.phone ?? fields.phone) === 'string'
        ? String(overrides.phone ?? fields.phone) : undefined,
      email: typeof (overrides.email ?? fields.email) === 'string'
        ? String(overrides.email ?? fields.email) : undefined,
      bio: typeof (overrides.bio ?? fields.description ?? fields.bio) === 'string'
        ? String(overrides.bio ?? fields.description ?? fields.bio) : undefined,
      openingHours: typeof (overrides.openingHours ?? fields.openingHours) === 'string'
        ? String(overrides.openingHours ?? fields.openingHours) : undefined,
      websiteUrl: typeof (overrides.websiteUrl ?? fields.websiteUrl) === 'string'
        ? String(overrides.websiteUrl ?? fields.websiteUrl) : undefined,
      instagramUrl: typeof (overrides.instagramUrl ?? fields.instagramUrl) === 'string'
        ? String(overrides.instagramUrl ?? fields.instagramUrl) : undefined,
      imageUrl: typeof (overrides.imageUrl ?? fields.imageUrl) === 'string'
        ? String(overrides.imageUrl ?? fields.imageUrl) : undefined
    }
  });

  await prisma.proposedChangeSet.update({
    where: { id: changeSet.id },
    data: { reviewStatus: 'approved', notes: `${changeSet.notes ?? ''} Promoted to Venue ${venue.id}.`.trim() }
  });

  await prisma.ingestionLog.create({
    data: {
      sourceDocumentId: changeSet.sourceDocumentId,
      stage: 'complete',
      status: 'success',
      message: `Promoted to Venue: ${venue.name} (id: ${venue.id})`,
      detail: { venueId: venue.id, domain, slug }
    }
  }).catch(() => {
    // non-blocking
  });

  return ok({ venue, promoted: true });
}
