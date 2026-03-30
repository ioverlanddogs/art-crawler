import { describe, expect, test } from 'vitest';

describe('vertical slice contract', () => {
  test('requires import secret env', () => {
    expect(typeof process.env.MINING_IMPORT_SECRET).toBe('string');
  });
});
