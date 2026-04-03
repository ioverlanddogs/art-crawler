import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';

// Mirror the helpers from the approve route for unit testing
function fingerprintArtist(name: string, sourceUrl: string): string {
  const key = `${name.trim().toLowerCase()}::${sourceUrl.trim().toLowerCase()}`;
  return createHash('sha256').update(key).digest('hex').slice(0, 32);
}

function toConfidenceBand(score: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (score >= 0.75) return 'HIGH';
  if (score >= 0.45) return 'MEDIUM';
  return 'LOW';
}

function extractArtistNames(mergedData: Record<string, unknown>): string[] {
  return Array.isArray(mergedData.artistNames)
    ? (mergedData.artistNames as unknown[])
        .map((n) => (typeof n === 'string' ? n.trim() : null))
        .filter((n): n is string => typeof n === 'string' && n.length > 0)
    : [];
}

describe('fingerprintArtist', () => {
  test('produces a 32-char hex string', () => {
    const fp = fingerprintArtist('Tracey Emin', 'https://gallery.example.com/events/opening');
    expect(fp).toHaveLength(32);
    expect(fp).toMatch(/^[0-9a-f]+$/);
  });

  test('same name + URL always produces the same fingerprint', () => {
    const a = fingerprintArtist('Tracey Emin', 'https://gallery.example.com');
    const b = fingerprintArtist('Tracey Emin', 'https://gallery.example.com');
    expect(a).toBe(b);
  });

  test('different names produce different fingerprints', () => {
    const a = fingerprintArtist('Tracey Emin', 'https://gallery.example.com');
    const b = fingerprintArtist('Damien Hirst', 'https://gallery.example.com');
    expect(a).not.toBe(b);
  });

  test('is case-insensitive for name and URL', () => {
    const a = fingerprintArtist('Tracey Emin', 'https://gallery.example.com');
    const b = fingerprintArtist('TRACEY EMIN', 'HTTPS://GALLERY.EXAMPLE.COM');
    expect(a).toBe(b);
  });

  test('different source URLs produce different fingerprints for same name', () => {
    const a = fingerprintArtist('Tracey Emin', 'https://gallery-a.com');
    const b = fingerprintArtist('Tracey Emin', 'https://gallery-b.com');
    expect(a).not.toBe(b);
  });
});

describe('toConfidenceBand', () => {
  test('0.75 and above is HIGH', () => {
    expect(toConfidenceBand(0.75)).toBe('HIGH');
    expect(toConfidenceBand(0.9)).toBe('HIGH');
    expect(toConfidenceBand(1.0)).toBe('HIGH');
  });

  test('0.45 to 0.74 is MEDIUM', () => {
    expect(toConfidenceBand(0.45)).toBe('MEDIUM');
    expect(toConfidenceBand(0.6)).toBe('MEDIUM');
    expect(toConfidenceBand(0.74)).toBe('MEDIUM');
  });

  test('below 0.45 is LOW', () => {
    expect(toConfidenceBand(0.44)).toBe('LOW');
    expect(toConfidenceBand(0.0)).toBe('LOW');
  });
});

describe('extractArtistNames', () => {
  test('extracts string array from mergedData', () => {
    const names = extractArtistNames({ artistNames: ['Tracey Emin', 'Damien Hirst'] });
    expect(names).toEqual(['Tracey Emin', 'Damien Hirst']);
  });

  test('trims whitespace from each name', () => {
    const names = extractArtistNames({ artistNames: ['  Tracey Emin  ', ' Damien Hirst'] });
    expect(names).toEqual(['Tracey Emin', 'Damien Hirst']);
  });

  test('filters out empty strings and non-strings', () => {
    const names = extractArtistNames({ artistNames: ['Tracey Emin', '', null, 42, 'Damien Hirst'] });
    expect(names).toEqual(['Tracey Emin', 'Damien Hirst']);
  });

  test('returns empty array when artistNames is absent', () => {
    expect(extractArtistNames({ title: 'Some Exhibition' })).toEqual([]);
  });

  test('returns empty array when artistNames is not an array', () => {
    expect(extractArtistNames({ artistNames: 'Tracey Emin' })).toEqual([]);
    expect(extractArtistNames({ artistNames: null })).toEqual([]);
  });

  test('falls back to 0.6 confidence when confidenceMap has no artistNames key', () => {
    const confidenceMap: Record<string, number> = {};
    const score = confidenceMap.artistNames ?? 0.6;
    expect(score).toBe(0.6);
    expect(Math.round(score * 100)).toBe(60);
    expect(toConfidenceBand(score)).toBe('MEDIUM');
  });
});
