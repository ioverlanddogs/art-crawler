import { describe, expect, test } from 'vitest';
import { fingerprint, clusterId } from '../../src/lib/dedup.js';

describe('dedup', () => {
  test('fingerprint deterministic', () => {
    expect(fingerprint('A', 'https://x')).toBe(fingerprint('A', 'https://x'));
  });

  test('cluster from fingerprint', () => {
    expect(clusterId('1234567890')).toBe('12345678');
  });
});
