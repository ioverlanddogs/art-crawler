import { beforeEach, describe, expect, test, vi } from 'vitest';

const prismaMock = {
  adminUser: {
    findFirst: vi.fn(),
    update: vi.fn()
  },
  account: {
    findUnique: vi.fn(),
    create: vi.fn(),
    delete: vi.fn()
  },
  session: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  },
  verificationToken: {
    create: vi.fn(),
    delete: vi.fn()
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
    process.env.NEXTAUTH_SECRET = 'test-secret';
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

  test('allows first-time invited admin OAuth sign-in without calling adapter createUser', async () => {
    prismaMock.adminUser.findFirst.mockResolvedValueOnce({ id: 'admin-invited', status: 'ACTIVE' });
    prismaMock.adminUser.update.mockResolvedValueOnce({ id: 'admin-invited' });

    const { authOptions } = await import('@/lib/auth');
    const result = await authOptions.callbacks!.signIn!({
      user: { id: 'admin-invited', email: 'invited-admin@example.com' },
      account: { provider: 'google', type: 'oauth' }
    } as never);

    expect(result).toBe(true);
    expect(prismaMock.adminUser.findFirst).toHaveBeenCalledWith({
      where: { email: { equals: 'invited-admin@example.com', mode: 'insensitive' } },
      select: { id: true, status: true }
    });
  });

  test('denies sign-in when admin user does not exist', async () => {
    prismaMock.adminUser.findFirst.mockResolvedValueOnce(null);

    const { authOptions } = await import('@/lib/auth');
    const result = await authOptions.callbacks!.signIn!({ user: { email: 'nobody@example.com' } } as never);

    expect(result).toBe(false);
    expect(prismaMock.adminUser.update).not.toHaveBeenCalled();
  });

  test('rejects unknown OAuth user on first login attempt', async () => {
    prismaMock.adminUser.findFirst.mockResolvedValueOnce(null);

    const { authOptions } = await import('@/lib/auth');
    const result = await authOptions.callbacks!.signIn!({
      user: { email: 'unknown@example.com' },
      account: { provider: 'google', type: 'oauth' }
    } as never);

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

  test('jwt/session callbacks map admin fields onto token + session user', async () => {
    prismaMock.adminUser.findFirst.mockResolvedValueOnce({
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
      status: 'ACTIVE'
    });

    const { authOptions } = await import('@/lib/auth');
    const token = await authOptions.callbacks!.jwt!({
      token: { sub: 'admin-1' },
      user: undefined
    } as never);

    const session = await authOptions.callbacks!.session!({
      session: { user: { name: null, email: null } },
      token
    } as never);

    expect(session.user).toMatchObject({
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
      status: 'ACTIVE'
    });
  });

  test('marks token suspended when admin status changes after login', async () => {
    prismaMock.adminUser.findFirst
      .mockResolvedValueOnce({
        id: 'admin-1',
        email: 'admin@example.com',
        name: 'Admin',
        role: 'admin',
        status: 'ACTIVE'
      })
      .mockResolvedValueOnce({
        id: 'admin-1',
        email: 'admin@example.com',
        name: 'Admin',
        role: 'admin',
        status: 'SUSPENDED'
      });

    const { authOptions } = await import('@/lib/auth');
    const activeToken = await authOptions.callbacks!.jwt!({ token: { sub: 'admin-1' }, user: undefined } as never);
    expect(activeToken.status).toBe('ACTIVE');

    const suspendedToken = await authOptions.callbacks!.jwt!({ token: activeToken, user: undefined } as never);
    expect(suspendedToken.status).toBe('SUSPENDED');
  });

  test('fails safely when database runtime is unavailable', async () => {
    runtimeMock.mockReturnValue(false);

    const { authOptions } = await import('@/lib/auth');
    const result = await authOptions.callbacks!.signIn!({ user: { email: 'admin@example.com' } } as never);

    expect(result).toBe(false);
    expect(authOptions.adapter).toBeUndefined();
    expect(authOptions.session).toEqual({ strategy: 'jwt', maxAge: 60 * 60 * 8 });
    expect(prismaMock.adminUser.findFirst).not.toHaveBeenCalled();
  });

  test('fails safely when NEXTAUTH_SECRET is missing', async () => {
    delete process.env.NEXTAUTH_SECRET;

    const { authOptions } = await import('@/lib/auth');
    const result = await authOptions.callbacks!.signIn!({ user: { email: 'admin@example.com' } } as never);

    expect(result).toBe(false);
  });
});
