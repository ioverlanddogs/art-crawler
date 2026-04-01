import { beforeEach, describe, expect, test, vi } from 'vitest';

const prismaMock = {
  adminUser: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn()
  }
};

const runtimeMock = vi.fn();

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/runtime-env', () => ({ isDatabaseRuntimeReady: runtimeMock }));
vi.mock('@/lib/env', () => ({
  getGoogleClientId: () => 'google-client-id',
  getGoogleClientSecret: () => 'google-client-secret'
}));

describe('google auth consistency', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    runtimeMock.mockReturnValue(true);
  });

  test('allows ACTIVE admin sign-in and updates lastLoginAt', async () => {
    prismaMock.adminUser.findFirst.mockResolvedValueOnce({ id: 'admin-1', status: 'ACTIVE' });
    prismaMock.adminUser.update.mockResolvedValueOnce({ id: 'admin-1' });

    const { authOptions } = await import('@/lib/auth');
    const result = await authOptions.callbacks!.signIn!({ user: { email: '  ADMIN@Example.com  ' } } as never);

    expect(result).toBe(true);
    expect(prismaMock.adminUser.findFirst).toHaveBeenCalledWith({
      where: { email: { equals: 'admin@example.com', mode: 'insensitive' } },
      select: { id: true, status: true }
    });
    expect(prismaMock.adminUser.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.adminUser.update.mock.calls[0][0].where).toEqual({ id: 'admin-1' });
    expect(prismaMock.adminUser.update.mock.calls[0][0].data.lastLoginAt).toBeInstanceOf(Date);
  });

  test('denies sign-in when admin user does not exist', async () => {
    prismaMock.adminUser.findFirst.mockResolvedValueOnce(null);

    const { authOptions } = await import('@/lib/auth');
    const result = await authOptions.callbacks!.signIn!({ user: { email: 'nobody@example.com' } } as never);

    expect(result).toBe(false);
    expect(prismaMock.adminUser.update).not.toHaveBeenCalled();
  });

  test('denies sign-in when admin user is not ACTIVE', async () => {
    prismaMock.adminUser.findFirst.mockResolvedValueOnce({ id: 'admin-2', status: 'SUSPENDED' });

    const { authOptions } = await import('@/lib/auth');
    const result = await authOptions.callbacks!.signIn!({ user: { email: 'suspended@example.com' } } as never);

    expect(result).toBe(false);
    expect(prismaMock.adminUser.update).not.toHaveBeenCalled();
  });

  test('session callback maps database admin fields onto session user', async () => {
    prismaMock.adminUser.findUnique.mockResolvedValueOnce({
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
      status: 'ACTIVE'
    });

    const { authOptions } = await import('@/lib/auth');
    const session = await authOptions.callbacks!.session!({
      session: { user: { name: null, email: null } },
      user: { id: 'admin-1' }
    } as never);

    expect(session.user).toMatchObject({
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
      status: 'ACTIVE'
    });
  });

  test('fails safely when database runtime is unavailable', async () => {
    runtimeMock.mockReturnValue(false);

    const { authOptions } = await import('@/lib/auth');
    const result = await authOptions.callbacks!.signIn!({ user: { email: 'admin@example.com' } } as never);

    expect(result).toBe(false);
    expect(authOptions.adapter).toBeUndefined();
    expect(prismaMock.adminUser.findFirst).not.toHaveBeenCalled();
  });
});
