import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {}
}));

function createDeps(inviteOverride?: Partial<any>) {
  const invite = {
    id: 'invite-1',
    userId: 'user-1',
    usedAt: null,
    expiresAt: new Date('2026-04-30T00:00:00.000Z'),
    user: { name: 'Invited User', email: 'invited@example.com' },
    ...inviteOverride
  };

  const adminInvite = {
    findUnique: vi.fn().mockResolvedValue(invite),
    update: vi.fn().mockResolvedValue({})
  };

  const adminUser = {
    update: vi.fn().mockResolvedValue({})
  };

  const prisma = {
    adminInvite,
    adminUser,
    $transaction: vi.fn().mockResolvedValue([])
  };

  return {
    prisma: prisma as any,
    adminInvite,
    adminUser,
    now: () => new Date('2026-03-30T12:00:00.000Z')
  };
}

describe('accept invite domain service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('accepts a valid invite and activates user even without NEXTAUTH_URL', async () => {
    delete process.env.NEXTAUTH_URL;
    const deps = createDeps();
    const { acceptInvite, hashInviteToken } = await import('@/lib/invites/accept-invite');

    const result = await acceptInvite({ token: 'raw-token' }, deps);

    expect(result).toEqual({ ok: true, email: expect.any(String) });
    expect(deps.adminInvite.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashInviteToken('raw-token') },
      include: { user: true }
    });
    expect(deps.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(deps.adminUser.update).toHaveBeenCalled();
    expect(deps.adminInvite.update).toHaveBeenCalled();
  });

  test('rejects invalid token', async () => {
    const deps = createDeps();
    deps.adminInvite.findUnique.mockResolvedValue(null);
    const { acceptInvite } = await import('@/lib/invites/accept-invite');

    const result = await acceptInvite({ token: 'missing' }, deps);

    expect(result).toEqual({ ok: false, code: 'INVALID_INVITE', message: 'Invite invalid or expired' });
  });

  test('rejects expired and reused token', async () => {
    const { acceptInvite } = await import('@/lib/invites/accept-invite');

    const expiredDeps = createDeps({ expiresAt: new Date('2026-03-01T00:00:00.000Z') });
    const expired = await acceptInvite({ token: 'expired' }, expiredDeps);
    expect(expired).toEqual({ ok: false, code: 'INVALID_INVITE', message: 'Invite invalid or expired' });

    const reusedDeps = createDeps({ usedAt: new Date('2026-03-10T00:00:00.000Z') });
    const reused = await acceptInvite({ token: 'reused' }, reusedDeps);
    expect(reused).toEqual({ ok: false, code: 'INVALID_INVITE', message: 'Invite invalid or expired' });
  });

  test('returns INTERNAL_ERROR when backend update fails', async () => {
    const deps = createDeps();
    deps.prisma.$transaction.mockRejectedValue(new Error('db unavailable'));
    const { acceptInvite } = await import('@/lib/invites/accept-invite');

    const result = await acceptInvite({ token: 'raw-token' }, deps);

    expect(result).toEqual({ ok: false, code: 'INTERNAL_ERROR', message: 'Unable to accept invite right now' });
  });

  test('findPendingInviteByToken rejects invite at expiry boundary', async () => {
    const deps = createDeps({ expiresAt: new Date('2026-03-30T12:00:00.000Z') });
    const { findPendingInviteByToken } = await import('@/lib/invites/accept-invite');
    const invite = await findPendingInviteByToken('raw-token', { prisma: deps.prisma as any, now: deps.now });
    expect(invite).toBeNull();
  });

  test('error mapping is explicit for API and UI responses', async () => {
    const { mapAcceptInviteErrorToStatus, mapAcceptInviteErrorToUiMessage } = await import('@/lib/invites/accept-invite');

    expect(mapAcceptInviteErrorToStatus('VALIDATION_ERROR')).toBe(400);
    expect(mapAcceptInviteErrorToStatus('INVALID_INVITE')).toBe(400);
    expect(mapAcceptInviteErrorToStatus('INTERNAL_ERROR')).toBe(500);

    expect(mapAcceptInviteErrorToUiMessage('INVALID_INVITE')).toContain('expired');
    expect(mapAcceptInviteErrorToUiMessage('INTERNAL_ERROR')).toContain('server error');
  });
});
