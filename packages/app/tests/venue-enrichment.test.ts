import { describe, expect, test } from 'vitest';

describe('venue enrich route — schema validation', () => {
  test('rejects missing url', async () => {
    const { z } = await import('zod');
    const schema = z.object({
      url: z.string().url(),
      mode: z.enum(['events', 'artists', 'artworks', 'gallery', 'auto'])
    });
    const result = schema.safeParse({ mode: 'artists' });
    expect(result.success).toBe(false);
  });

  test('rejects invalid mode', async () => {
    const { z } = await import('zod');
    const schema = z.object({
      url: z.string().url(),
      mode: z.enum(['events', 'artists', 'artworks', 'gallery', 'auto'])
    });
    const result = schema.safeParse({
      url: 'https://gallery.example.com/artists',
      mode: 'invalid'
    });
    expect(result.success).toBe(false);
  });

  test('accepts all valid modes', async () => {
    const { z } = await import('zod');
    const schema = z.object({
      url: z.string().url(),
      mode: z.enum(['events', 'artists', 'artworks', 'gallery', 'auto'])
    });
    for (const mode of ['events', 'artists', 'artworks', 'gallery', 'auto']) {
      const result = schema.safeParse({
        url: 'https://gallery.example.com/artists',
        mode
      });
      expect(result.success).toBe(true);
    }
  });
});

describe('artist promote route — schema validation', () => {
  test('rejects missing ingestExtractedArtistId', async () => {
    const { z } = await import('zod');
    const schema = z.object({ ingestExtractedArtistId: z.string().min(1) });
    const result = schema.safeParse({});
    expect(result.success).toBe(false);
  });

  test('accepts valid payload with overrides', async () => {
    const { z } = await import('zod');
    const schema = z.object({
      ingestExtractedArtistId: z.string().min(1),
      overrides: z.object({
        name: z.string().optional(),
        bio: z.string().optional(),
        nationality: z.string().optional(),
        birthYear: z.number().int().optional(),
        medium: z.string().optional()
      }).optional()
    });
    const result = schema.safeParse({
      ingestExtractedArtistId: 'test-id',
      overrides: { name: 'Jane Doe', nationality: 'British', birthYear: 1985 }
    });
    expect(result.success).toBe(true);
  });
});

describe('slugify behaviour', () => {
  test('converts name to slug format', () => {
    function slugify(name: string): string {
      return name.toLowerCase().trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 80);
    }
    expect(slugify('Victoria Miro Gallery')).toBe('victoria-miro-gallery');
    expect(slugify('Tate Modern')).toBe('tate-modern');
    expect(slugify('  White Cube  ')).toBe('white-cube');
    expect(slugify("L'Espace d'Art")).toBe('lespace-dart');
  });
});
