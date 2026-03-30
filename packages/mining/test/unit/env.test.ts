import { afterEach, describe, expect, test } from 'vitest';
import {
  getImportSecretFromEnv,
  getMiningRedisUrl,
  readMiningRuntimeEnv
} from '../../src/lib/env.js';

const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  process.env = { ...ORIGINAL_ENV };
}

afterEach(() => {
  resetEnv();
});

describe('mining env contract', () => {
  test('uses canonical MINING_IMPORT_SECRET over legacy fallback', () => {
    process.env.MINING_IMPORT_SECRET = 'canonical-secret';
    process.env.MINING_SERVICE_SECRET = 'legacy-secret';

    expect(getImportSecretFromEnv()).toBe('canonical-secret');
  });

  test('keeps legacy MINING_SERVICE_SECRET fallback for compatibility', () => {
    delete process.env.MINING_IMPORT_SECRET;
    process.env.MINING_SERVICE_SECRET = 'legacy-secret';

    expect(getImportSecretFromEnv()).toBe('legacy-secret');
  });

  test('fails clearly when required vars are missing', () => {
    delete process.env.PIPELINE_IMPORT_URL;
    delete process.env.MINING_DATABASE_URL;
    delete process.env.MINING_IMPORT_SECRET;
    delete process.env.MINING_SERVICE_SECRET;

    expect(() => readMiningRuntimeEnv()).toThrow('PIPELINE_IMPORT_URL');
  });

  test('accepts canonical required vars and applies redis default', () => {
    process.env.PIPELINE_IMPORT_URL = 'https://app.example.test/api/pipeline/import';
    process.env.MINING_DATABASE_URL = 'postgresql://example.test/mining';
    process.env.MINING_IMPORT_SECRET = 'canonical-secret';
    delete process.env.REDIS_URL;

    const runtime = readMiningRuntimeEnv();
    expect(runtime.redisUrl).toBe('redis://localhost:6379');
    expect(getMiningRedisUrl()).toBe('redis://localhost:6379');
  });
});
