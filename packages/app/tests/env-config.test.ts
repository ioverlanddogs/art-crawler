import { afterEach, describe, expect, test } from 'vitest';
import { getAppBaseUrl, getImportSecretFromEnv } from '@/lib/env';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('app env config contract', () => {
  test('prefers canonical MINING_IMPORT_SECRET over legacy fallback', () => {
    process.env.MINING_IMPORT_SECRET = 'canonical-secret';
    process.env.MINING_SERVICE_SECRET = 'legacy-secret';

    expect(getImportSecretFromEnv()).toBe('canonical-secret');
  });

  test('keeps legacy MINING_SERVICE_SECRET fallback when canonical is absent', () => {
    delete process.env.MINING_IMPORT_SECRET;
    process.env.MINING_SERVICE_SECRET = 'legacy-secret';

    expect(getImportSecretFromEnv()).toBe('legacy-secret');
  });

  test('uses NEXTAUTH_URL as canonical app base URL with local fallback', () => {
    process.env.NEXTAUTH_URL = 'https://admin.example.test';
    expect(getAppBaseUrl()).toBe('https://admin.example.test');

    delete process.env.NEXTAUTH_URL;
    expect(getAppBaseUrl()).toBe('http://localhost:3000');
  });
});
