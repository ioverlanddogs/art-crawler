import { beforeEach, describe, expect, test, vi } from 'vitest';

const prismaMock = {
  siteSetting: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  }
};

vi.mock('@/lib/db', () => ({
  prisma: prismaMock
}));

describe('login rate limiter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('isLoginRateLimited returns false when no records exist', async () => {
    prismaMock.siteSetting.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    const { isLoginRateLimited } = await import('@/lib/auth/login-rate-limiter');
    await expect(isLoginRateLimited('user@example.com')).resolves.toBe(false);
  });

  test('isLoginRateLimited returns false when the window has expired', async () => {
    const windowStart = Date.now() - 20 * 60 * 1000;
    prismaMock.siteSetting.findUnique
      .mockResolvedValueOnce({ value: '15' })
      .mockResolvedValueOnce({ value: String(windowStart) });

    const { isLoginRateLimited } = await import('@/lib/auth/login-rate-limiter');
    await expect(isLoginRateLimited('user@example.com')).resolves.toBe(false);
  });

  test('isLoginRateLimited returns true when attempts >= 10 within an active window', async () => {
    const windowStart = Date.now() - 2 * 60 * 1000;
    prismaMock.siteSetting.findUnique
      .mockResolvedValueOnce({ value: '10' })
      .mockResolvedValueOnce({ value: String(windowStart) });

    const { isLoginRateLimited } = await import('@/lib/auth/login-rate-limiter');
    await expect(isLoginRateLimited('user@example.com')).resolves.toBe(true);
  });

  test('recordLoginAttempt calls siteSetting.upsert twice when starting a new window', async () => {
    prismaMock.siteSetting.findUnique.mockResolvedValueOnce(null);

    const { recordLoginAttempt } = await import('@/lib/auth/login-rate-limiter');
    await recordLoginAttempt('user@example.com');

    expect(prismaMock.siteSetting.upsert).toHaveBeenCalledTimes(2);
  });

  test('recordLoginAttempt increments the counter when within an existing window', async () => {
    const windowStart = Date.now() - 60 * 1000;
    prismaMock.siteSetting.findUnique
      .mockResolvedValueOnce({ value: String(windowStart) })
      .mockResolvedValueOnce({ value: '3' });

    const { recordLoginAttempt } = await import('@/lib/auth/login-rate-limiter');
    await recordLoginAttempt('user@example.com');

    expect(prismaMock.siteSetting.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.siteSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { value: '4' }
      })
    );
  });

  test('clearLoginAttempts calls siteSetting.delete for both count key and window key', async () => {
    prismaMock.siteSetting.delete.mockResolvedValue({});

    const { clearLoginAttempts } = await import('@/lib/auth/login-rate-limiter');
    await clearLoginAttempts('user@example.com');

    expect(prismaMock.siteSetting.delete).toHaveBeenCalledTimes(2);
    expect(prismaMock.siteSetting.delete).toHaveBeenNthCalledWith(1, {
      where: { key: 'login_attempts:user@example.com' }
    });
    expect(prismaMock.siteSetting.delete).toHaveBeenNthCalledWith(2, {
      where: { key: 'login_window:user@example.com' }
    });
  });
});
