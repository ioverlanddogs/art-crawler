import { describe, expect, test } from 'vitest';

function fingerprint(url: string, title: string) {
  return Buffer.from(`${url}|${title}`.toLowerCase()).toString('hex').slice(0, 16);
}

describe('fingerprint utility', () => {
  test('is deterministic', () => {
    expect(fingerprint('https://x.test', 'A')).toBe(fingerprint('https://x.test', 'A'));
  });
});
