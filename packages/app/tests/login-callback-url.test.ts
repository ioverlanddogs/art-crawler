import { describe, expect, test } from 'vitest';
import { isSafeCallbackUrl } from '@/app/(auth)/login/LoginClient';

describe('isSafeCallbackUrl', () => {
  test('allows standard relative paths', () => {
    expect(isSafeCallbackUrl('/dashboard')).toBe(true);
    expect(isSafeCallbackUrl('/moderation/queue')).toBe(true);
    expect(isSafeCallbackUrl('/intake?tab=pending')).toBe(true);
    expect(isSafeCallbackUrl('/system')).toBe(true);
  });

  test('rejects empty string', () => {
    expect(isSafeCallbackUrl('')).toBe(false);
  });

  test('rejects protocol-relative URLs (open redirect via //)', () => {
    expect(isSafeCallbackUrl('//evil.com')).toBe(false);
    expect(isSafeCallbackUrl('//evil.com/path')).toBe(false);
  });

  test('rejects absolute http/https URLs', () => {
    expect(isSafeCallbackUrl('https://evil.com')).toBe(false);
    expect(isSafeCallbackUrl('http://evil.com')).toBe(false);
  });

  test('rejects backslash bypass variant', () => {
    expect(isSafeCallbackUrl('/\\evil.com')).toBe(false);
  });

  test('rejects non-path strings', () => {
    expect(isSafeCallbackUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeCallbackUrl('evil.com')).toBe(false);
  });
});
