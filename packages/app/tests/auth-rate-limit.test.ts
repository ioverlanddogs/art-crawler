import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { checkRateLimit, recordFailure, resetRateLimit } from '@/lib/auth-rate-limit';

const EMAIL = 'admin@example.com';

describe('auth rate limit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    resetRateLimit(EMAIL);
  });

  afterEach(() => {
    resetRateLimit(EMAIL);
    vi.useRealTimers();
  });

  test('first call on unseen email is allowed', () => {
    expect(checkRateLimit(EMAIL)).toEqual({ allowed: true });
  });

  test('4 failures still allowed', () => {
    for (let i = 0; i < 4; i += 1) {
      recordFailure(EMAIL);
    }

    expect(checkRateLimit(EMAIL)).toEqual({ allowed: true });
  });

  test('5th failure blocks with positive retryAfterSeconds', () => {
    for (let i = 0; i < 5; i += 1) {
      recordFailure(EMAIL);
    }

    const result = checkRateLimit(EMAIL);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  test('window expiry resets allowance', () => {
    for (let i = 0; i < 5; i += 1) {
      recordFailure(EMAIL);
    }

    vi.advanceTimersByTime(15 * 60 * 1000);

    expect(checkRateLimit(EMAIL)).toEqual({ allowed: true });
    recordFailure(EMAIL);
    expect(checkRateLimit(EMAIL)).toEqual({ allowed: true });
  });

  test('resetRateLimit clears existing record', () => {
    for (let i = 0; i < 5; i += 1) {
      recordFailure(EMAIL);
    }

    resetRateLimit(EMAIL);

    expect(checkRateLimit(EMAIL)).toEqual({ allowed: true });
  });

  test('retryAfterSeconds tracks remaining time', () => {
    for (let i = 0; i < 5; i += 1) {
      recordFailure(EMAIL);
    }

    vi.advanceTimersByTime(2 * 60 * 1000 + 10 * 1000);

    const result = checkRateLimit(EMAIL);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBe(770);
  });
});
