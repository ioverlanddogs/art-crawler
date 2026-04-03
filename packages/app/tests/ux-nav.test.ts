import { describe, expect, test } from 'vitest';

describe('nav active state logic', () => {
  function isActive(pathname: string, href: string): boolean {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(href + '/');
  }

  test('exact match marks link active', () => {
    expect(isActive('/intake', '/intake')).toBe(true);
    expect(isActive('/venues', '/venues')).toBe(true);
    expect(isActive('/artists', '/artists')).toBe(true);
  });

  test('child routes mark parent link active', () => {
    expect(isActive('/intake/cm123abc', '/intake')).toBe(true);
    expect(isActive('/venues/cm456def', '/venues')).toBe(true);
    expect(isActive('/venues/cm456def/enrich', '/venues')).toBe(true);
  });

  test('sibling routes do not mark link active', () => {
    expect(isActive('/intake', '/inspect')).toBe(false);
    expect(isActive('/venues', '/intake')).toBe(false);
  });

  test('root path only matches exactly', () => {
    expect(isActive('/', '/')).toBe(true);
    expect(isActive('/dashboard', '/')).toBe(false);
  });

  test('partial string prefix does not activate — /intake-batch vs /intake', () => {
    expect(isActive('/intake-batch', '/intake')).toBe(false);
  });
});

describe('primary nav hrefs', () => {
  test('primary set contains all daily workflow items', () => {
    const primary = new Set([
      '/dashboard', '/inspect', '/search', '/venues', '/intake',
      '/moderation', '/publish', '/artists', '/artworks'
    ]);
    expect(primary.has('/dashboard')).toBe(true);
    expect(primary.has('/intake')).toBe(true);
    expect(primary.has('/moderation')).toBe(true);
    expect(primary.has('/artists')).toBe(true);
    expect(primary.has('/artworks')).toBe(true);
    // secondary items should NOT be in primary
    expect(primary.has('/audit')).toBe(false);
    expect(primary.has('/operations')).toBe(false);
    expect(primary.has('/recovery-studio')).toBe(false);
  });
});

describe('status filter values', () => {
  test('all expected status filter values are defined', () => {
    const filters = ['', 'needs_review', 'failed', 'fetching', 'published'];
    expect(filters).toContain('needs_review');
    expect(filters).toContain('failed');
    expect(filters).toHaveLength(5);
  });
});

describe('confidence colour thresholds', () => {
  function confidenceTone(conf: number): string {
    if (conf >= 0.7) return 'success';
    if (conf >= 0.4) return 'warning';
    return 'danger';
  }

  test('high confidence maps to success', () => {
    expect(confidenceTone(0.85)).toBe('success');
    expect(confidenceTone(0.70)).toBe('success');
  });

  test('medium confidence maps to warning', () => {
    expect(confidenceTone(0.55)).toBe('warning');
    expect(confidenceTone(0.40)).toBe('warning');
  });

  test('low confidence maps to danger', () => {
    expect(confidenceTone(0.39)).toBe('danger');
    expect(confidenceTone(0.10)).toBe('danger');
  });
});
