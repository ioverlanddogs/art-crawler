import { beforeEach, describe, expect, test, vi } from 'vitest';

const acceptInviteMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/invites/accept-invite', () => ({
  acceptInvite: acceptInviteMock,
  mapAcceptInviteErrorToStatus: (code: string) => (code === 'INTERNAL_ERROR' ? 500 : 400)
}));

describe('POST /api/auth/accept-invite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('returns success payload when invite is accepted', async () => {
    acceptInviteMock.mockResolvedValue({ ok: true });
    const { POST } = await import('@/app/api/auth/accept-invite/route');

    const res = await POST(new Request('http://localhost/api/auth/accept-invite', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 't', name: 'N', password: '123456789012', confirmPassword: '123456789012' })
    }));

    expect(res.status).toBe(200);
  });

  test('returns validation error on malformed json body', async () => {
    const { POST } = await import('@/app/api/auth/accept-invite/route');

    const res = await POST(new Request('http://localhost/api/auth/accept-invite', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{'
    }));

    expect(res.status).toBe(400);
    expect(acceptInviteMock).not.toHaveBeenCalled();
  });

  test('maps invalid and internal errors to response status', async () => {
    const { POST } = await import('@/app/api/auth/accept-invite/route');

    acceptInviteMock.mockResolvedValueOnce({ ok: false, code: 'INVALID_INVITE', message: 'Invite invalid or expired' });
    let res = await POST(new Request('http://localhost/api/auth/accept-invite', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'bad', name: 'N', password: '123456789012', confirmPassword: '123456789012' })
    }));
    expect(res.status).toBe(400);

    acceptInviteMock.mockResolvedValueOnce({ ok: false, code: 'INTERNAL_ERROR', message: 'Unable to accept invite right now' });
    res = await POST(new Request('http://localhost/api/auth/accept-invite', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'bad', name: 'N', password: '123456789012', confirmPassword: '123456789012' })
    }));
    expect(res.status).toBe(500);
  });
});
