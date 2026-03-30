import { afterEach, describe, expect, test } from 'vitest';
import { getImportAuthSecret, isPipelineImportAuthorized } from '@/lib/pipeline/import-auth';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('pipeline import auth env contract', () => {
  test('prefers canonical MINING_IMPORT_SECRET when both vars are set', () => {
    process.env.MINING_IMPORT_SECRET = 'canonical-secret';
    process.env.MINING_SERVICE_SECRET = 'legacy-secret';

    expect(getImportAuthSecret()).toBe('canonical-secret');
  });

  test('accepts legacy MINING_SERVICE_SECRET fallback when canonical is missing', () => {
    delete process.env.MINING_IMPORT_SECRET;
    process.env.MINING_SERVICE_SECRET = 'legacy-secret';

    expect(getImportAuthSecret()).toBe('legacy-secret');
  });

  test('rejects requests when import secret is missing', () => {
    delete process.env.MINING_IMPORT_SECRET;
    delete process.env.MINING_SERVICE_SECRET;

    const req = new Request('http://localhost/api/pipeline/import', {
      headers: { authorization: 'Bearer anything' }
    });

    expect(isPipelineImportAuthorized(req)).toBe(false);
  });
});
