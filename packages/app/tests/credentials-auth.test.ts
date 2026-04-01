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
const verifyPasswordMock = vi.fn();
const checkRateLimitMock = vi.fn();
const recordFailureMock = vi.fn();
const resetRateLimitMock = vi.fn();

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/runtime-env', () => ({ isDatabaseRuntimeReady: runtimeMock }));
vi.mock('@/lib/env', () => ({
  getGoogleClientId: () => 'google-client-id',
  getGoogleClientSecret: () => 'google-client-secret'
}));
vi.mock('@/lib/password', () => ({ verifyPassword: verifyPasswordMock }));
vi.mock('@/lib/auth-rate-limit', () => ({
  checkRateLimit: checkRateLimitMock,
  recordFailure: recordFailureMock,
  resetRateLimit: resetRateLimitMock
}));

describe('credentials auth', () => {
  function getCredentialsAuthorize(authOptions: { providers: unknown[] }) {
    const provider = authOptions.providers.find((item) => ((item as { id?: string }).id ?? '') === 'credentials') as
      | { options?: { authorize?: (credentials: Record<string, string> | undefined, req: unknown) => Promise<unknown> } }
      | undefined;
    const authorize = provider?.options?.authorize;
    if (!authorize) {
      throw new Error('Credentials authorize callback not found');
    }
    return authorize;
  }

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    runtimeMock.mockReturnValue(true);
    checkRateLimitMock.mockReturnValue({ allowed: true });
    process.env.NEXTAUTH_SECRET = 'test-secret';
  });

  test('correct password + ACTIVE user returns credentials user object', async () => {
    prismaMock.adminUser.findFirst.mockResolvedValueOnce({
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
      status: 'ACTIVE',
      passwordHash: 'hash'
    });
    verifyPasswordMock.mockResolvedValueOnce(true);

    const { authOptions } = await import('@/lib/auth');
    const authorize = getCredentialsAuthorize(authOptions);
    const result = await authorize(
      {
      email: 'Admin@Example.com',
      password: 'correct-password'
      },
      {} as never
    );

    expect(result).toEqual({
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
      status: 'ACTIVE'
    });
  });

  test('wrong password records failure and returns null', async () => {
    prismaMock.adminUser.findFirst.mockResolvedValueOnce({
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
      status: 'ACTIVE',
      passwordHash: 'hash'
    });
    verifyPasswordMock.mockResolvedValueOnce(false);

    const { authOptions } = await import('@/lib/auth');
    const authorize = getCredentialsAuthorize(authOptions);
    const result = await authorize(
      {
      email: 'admin@example.com',
      password: 'wrong-password'
      },
      {} as never
    );

    expect(result).toBeNull();
    expect(recordFailureMock).toHaveBeenCalledTimes(1);
  });

  test('returns null when user has no passwordHash', async () => {
    prismaMock.adminUser.findFirst.mockResolvedValueOnce({
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
      status: 'ACTIVE',
      passwordHash: null
    });

    const { authOptions } = await import('@/lib/auth');
    const authorize = getCredentialsAuthorize(authOptions);
    const result = await authorize(
      {
      email: 'admin@example.com',
      password: 'any-password'
      },
      {} as never
    );

    expect(result).toBeNull();
    expect(verifyPasswordMock).not.toHaveBeenCalled();
  });

  test('returns null for non-ACTIVE user without verifying password', async () => {
    prismaMock.adminUser.findFirst.mockResolvedValueOnce({
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
      status: 'SUSPENDED',
      passwordHash: 'hash'
    });

    const { authOptions } = await import('@/lib/auth');
    const authorize = getCredentialsAuthorize(authOptions);
    const result = await authorize(
      {
      email: 'admin@example.com',
      password: 'any-password'
      },
      {} as never
    );

    expect(result).toBeNull();
    expect(verifyPasswordMock).not.toHaveBeenCalled();
  });

  test('returns null when user is not found', async () => {
    prismaMock.adminUser.findFirst.mockResolvedValueOnce(null);

    const { authOptions } = await import('@/lib/auth');
    const authorize = getCredentialsAuthorize(authOptions);
    const result = await authorize(
      {
      email: 'missing@example.com',
      password: 'password'
      },
      {} as never
    );

    expect(result).toBeNull();
  });

  test('rate limit exceeded returns null before DB query', async () => {
    checkRateLimitMock.mockReturnValueOnce({ allowed: false, retryAfterSeconds: 30 });

    const { authOptions } = await import('@/lib/auth');
    const authorize = getCredentialsAuthorize(authOptions);
    const result = await authorize(
      {
      email: 'admin@example.com',
      password: 'password'
      },
      {} as never
    );

    expect(result).toBeNull();
    expect(prismaMock.adminUser.findFirst).not.toHaveBeenCalled();
  });

  test('successful login resets rate limit and updates lastLoginAt', async () => {
    prismaMock.adminUser.findFirst.mockResolvedValueOnce({
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
      status: 'ACTIVE',
      passwordHash: 'hash'
    });
    verifyPasswordMock.mockResolvedValueOnce(true);

    const { authOptions } = await import('@/lib/auth');
    const authorize = getCredentialsAuthorize(authOptions);
    await authorize(
      {
        email: 'admin@example.com',
        password: 'password'
      },
      {} as never
    );

    expect(resetRateLimitMock).toHaveBeenCalledWith('admin@example.com');
    expect(prismaMock.adminUser.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.adminUser.update.mock.calls[0][0].data.lastLoginAt).toBeInstanceOf(Date);
  });

  test('signIn callback returns true for credentials provider without querying DB', async () => {
    const { authOptions } = await import('@/lib/auth');
    const result = await authOptions.callbacks!.signIn!({
      user: { email: 'admin@example.com' },
      account: { provider: 'credentials', type: 'credentials' }
    } as never);

    expect(result).toBe(true);
    expect(prismaMock.adminUser.findFirst).not.toHaveBeenCalled();
  });
});
