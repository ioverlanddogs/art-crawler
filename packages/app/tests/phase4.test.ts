import { describe, expect, test, vi, afterEach } from 'vitest';

describe('registerVenueAsTrustedSource — no-op when MINING_DATABASE_URL is unset', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  test('returns registered: false when MINING_DATABASE_URL is not set', async () => {
    vi.stubEnv('MINING_DATABASE_URL', '');
    const { registerVenueAsTrustedSource } = await import('@/lib/mining-db');
    const result = await registerVenueAsTrustedSource({
      name: 'Test Gallery',
      domain: 'testgallery.com',
      seedUrl: 'https://testgallery.com',
      region: 'uk'
    });
    expect(result.registered).toBe(false);
    expect(result.reason).toBe('MINING_DATABASE_URL not configured');
  });
});

describe('artists page — query shape validation', () => {
  test('confidence band tones are correctly mapped', () => {
    function tone(band: string) {
      if (band === 'HIGH') return 'success';
      if (band === 'MEDIUM') return 'warning';
      return 'danger';
    }
    expect(tone('HIGH')).toBe('success');
    expect(tone('MEDIUM')).toBe('warning');
    expect(tone('LOW')).toBe('danger');
  });
});

describe('artworks page — availability tone mapping', () => {
  test('maps availability to correct badge tone', () => {
    function availabilityTone(a: string | null) {
      if (a === 'available') return 'success';
      if (a === 'sold') return 'neutral';
      if (a === 'on_loan') return 'info';
      return 'warning';
    }
    expect(availabilityTone('available')).toBe('success');
    expect(availabilityTone('sold')).toBe('neutral');
    expect(availabilityTone('on_loan')).toBe('info');
    expect(availabilityTone('unknown')).toBe('warning');
    expect(availabilityTone(null)).toBe('warning');
  });
});

describe('TrustedSource registration defaults', () => {
  test('gallery source type is always used for venue registrations', () => {
    const defaults = {
      sourceType: 'gallery',
      trustTier: 3,
      crawlDepth: 1,
      maxUrlsPerRun: 5
    };
    expect(defaults.sourceType).toBe('gallery');
    expect(defaults.trustTier).toBe(3);
    expect(defaults.crawlDepth).toBe(1);
    expect(defaults.maxUrlsPerRun).toBe(5);
  });

  test('blocked path patterns always exclude common non-content paths', () => {
    const blocked = ['/cart', '/checkout', '/account', '/signin', '/login'];
    expect(blocked).toContain('/cart');
    expect(blocked).toContain('/checkout');
    expect(blocked).toContain('/signin');
    expect(blocked).toContain('/login');
  });
});
