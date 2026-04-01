import { beforeEach, describe, expect, test, vi } from 'vitest';

const prismaMock = {
  adminUser: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
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

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));

describe('custom admin auth adapter', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  test('rejects createUser so OAuth remains invite-only', async () => {
    const { createAdminPrismaAdapter } = await import('@/lib/auth-adapter');
    const adapter = createAdminPrismaAdapter();

    await expect(adapter.createUser!({ email: 'new@example.com' } as never)).rejects.toThrow(
      'Admin accounts must be provisioned via invite flow before OAuth sign-in.'
    );
  });

  test('links and unlinks OAuth accounts with provider composite key', async () => {
    prismaMock.account.create.mockResolvedValueOnce({ id: 'acct-1', provider: 'google', providerAccountId: 'google-1', userId: 'admin-1' });

    const { createAdminPrismaAdapter } = await import('@/lib/auth-adapter');
    const adapter = createAdminPrismaAdapter();

    await adapter.linkAccount!({
      userId: 'admin-1',
      type: 'oauth',
      provider: 'google',
      providerAccountId: 'google-1'
    } as never);

    expect(prismaMock.account.create).toHaveBeenCalledTimes(1);

    await adapter.unlinkAccount!({ provider: 'google', providerAccountId: 'google-1' } as never);
    expect(prismaMock.account.delete).toHaveBeenCalledWith({
      where: { provider_providerAccountId: { provider: 'google', providerAccountId: 'google-1' } }
    });
  });

  test('deletes sessions by session token for cleanup', async () => {
    const { createAdminPrismaAdapter } = await import('@/lib/auth-adapter');
    const adapter = createAdminPrismaAdapter();

    await adapter.deleteSession!('session-token-1');

    expect(prismaMock.session.delete).toHaveBeenCalledWith({ where: { sessionToken: 'session-token-1' } });
  });
});
