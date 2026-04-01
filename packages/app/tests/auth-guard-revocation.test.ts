import { beforeEach, describe, expect, test, vi } from 'vitest';

const getServerSessionMock = vi.fn();

const prismaMock = {
  adminUser: {
    findFirst: vi.fn()
  }
};

vi.mock('next-auth', () => ({
  getServerSession: getServerSessionMock
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {}
}));

vi.mock('@/lib/db', () => ({
  prisma: prismaMock
}));

describe('auth guard revocation semantics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('rejects disabled/suspended admin even when session token says ACTIVE', async () => {
    getServerSessionMock.mockResolvedValueOnce({
      user: { id: 'admin-1', email: 'ops@example.test', role: 'admin', status: 'ACTIVE' }
    });
    prismaMock.adminUser.findFirst.mockResolvedValueOnce({
      id: 'admin-1',
      email: 'ops@example.test',
      name: 'Ops',
      role: 'admin',
      status: 'SUSPENDED'
    });

    const { requireRole } = await import('@/lib/auth-guard');

    await expect(requireRole(['admin'])).rejects.toMatchObject({ status: 403 });
  });

  test('rejects users removed from DB after login', async () => {
    getServerSessionMock.mockResolvedValueOnce({
      user: { id: 'admin-1', email: 'ops@example.test', role: 'admin', status: 'ACTIVE' }
    });
    prismaMock.adminUser.findFirst.mockResolvedValueOnce(null);

    const { requireRole } = await import('@/lib/auth-guard');

    await expect(requireRole(['admin'])).rejects.toMatchObject({ status: 401 });
  });

  test('refreshes session role/status from DB on each protected request', async () => {
    getServerSessionMock.mockResolvedValueOnce({
      user: { id: 'admin-1', email: 'ops@example.test', role: 'viewer', status: 'ACTIVE' }
    });
    prismaMock.adminUser.findFirst.mockResolvedValueOnce({
      id: 'admin-1',
      email: 'ops@example.test',
      name: 'Ops',
      role: 'operator',
      status: 'ACTIVE'
    });

    const { requireRole } = await import('@/lib/auth-guard');
    const session = await requireRole(['operator', 'admin']);

    expect(session.user.role).toBe('operator');
    expect(session.user.status).toBe('ACTIVE');
  });
});
