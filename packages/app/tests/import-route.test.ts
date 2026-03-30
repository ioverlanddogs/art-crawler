import { describe, expect, test } from 'vitest';
import { fingerprint } from '@/lib/fingerprint';

describe('fingerprint utility', () => {
  test('is deterministic', () => {
    expect(fingerprint('A', 'https://x.test')).toBe(fingerprint('A', 'https://x.test'));
  });
});
