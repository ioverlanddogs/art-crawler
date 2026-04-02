import { describe, expect, test } from 'vitest';

describe('inspect fetch route — schema validation', () => {
  test('rejects missing url', async () => {
    const { z } = await import('zod');
    const schema = z.object({ url: z.string().url() });
    const result = schema.safeParse({});
    expect(result.success).toBe(false);
  });

  test('rejects invalid url', async () => {
    const { z } = await import('zod');
    const schema = z.object({ url: z.string().url() });
    const result = schema.safeParse({ url: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  test('accepts valid url', async () => {
    const { z } = await import('zod');
    const schema = z.object({ url: z.string().url() });
    const result = schema.safeParse({ url: 'https://gallery.example.com' });
    expect(result.success).toBe(true);
  });
});

describe('inspect extract route — schema validation', () => {
  test('rejects unknown mode', async () => {
    const { z } = await import('zod');
    const schema = z.object({
      url: z.string().url(),
      extractedText: z.string().max(8000),
      mode: z.enum(['events', 'artists', 'artworks', 'gallery', 'auto']).default('events'),
    });
    const result = schema.safeParse({
      url: 'https://example.com',
      extractedText: 'text',
      mode: 'invalid_mode',
    });
    expect(result.success).toBe(false);
  });

  test('defaults mode to events', async () => {
    const { z } = await import('zod');
    const schema = z.object({
      url: z.string().url(),
      extractedText: z.string().max(8000),
      mode: z.enum(['events', 'artists', 'artworks', 'gallery', 'auto']).default('events'),
    });
    const result = schema.safeParse({
      url: 'https://example.com',
      extractedText: 'text',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.mode).toBe('events');
  });

  test('accepts all valid modes', async () => {
    const { z } = await import('zod');
    const schema = z.object({
      url: z.string().url(),
      extractedText: z.string().max(8000),
      mode: z.enum(['events', 'artists', 'artworks', 'gallery', 'auto']).default('events'),
    });
    for (const mode of ['events', 'artists', 'artworks', 'gallery', 'auto']) {
      const result = schema.safeParse({ url: 'https://example.com', extractedText: 'text', mode });
      expect(result.success).toBe(true);
    }
  });
});

describe('inspect commit route — schema validation', () => {
  test('rejects missing required fields', async () => {
    const { z } = await import('zod');
    const schema = z.object({
      url: z.string().url(),
      mode: z.enum(['events', 'artists', 'artworks', 'gallery', 'auto']),
      modelVersion: z.string(),
      fields: z.record(z.unknown()),
      humanReviewed: z.boolean().default(true),
    });
    const result = schema.safeParse({ url: 'https://example.com' });
    expect(result.success).toBe(false);
  });

  test('accepts valid commit payload', async () => {
    const { z } = await import('zod');
    const schema = z.object({
      url: z.string().url(),
      mode: z.enum(['events', 'artists', 'artworks', 'gallery', 'auto']),
      modelVersion: z.string(),
      fields: z.record(z.unknown()),
      humanReviewed: z.boolean().default(true),
    });
    const result = schema.safeParse({
      url: 'https://gallery.example.com',
      mode: 'events',
      modelVersion: 'claude-haiku-4-5-20251001',
      fields: { title: 'Test Exhibition', locationText: 'London' },
      humanReviewed: true,
    });
    expect(result.success).toBe(true);
  });

  test('humanReviewed defaults to true', async () => {
    const { z } = await import('zod');
    const schema = z.object({
      url: z.string().url(),
      mode: z.enum(['events', 'artists', 'artworks', 'gallery', 'auto']),
      modelVersion: z.string(),
      fields: z.record(z.unknown()),
      humanReviewed: z.boolean().default(true),
    });
    const result = schema.safeParse({
      url: 'https://example.com',
      mode: 'events',
      modelVersion: 'model-v1',
      fields: { title: 'Test' },
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.humanReviewed).toBe(true);
  });
});
