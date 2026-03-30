import { beforeEach, describe, expect, test, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const inviteLibMock = vi.hoisted(() => ({
  acceptInvite: vi.fn(),
  findPendingInviteByToken: vi.fn(),
  mapAcceptInviteErrorToUiMessage: vi.fn()
}));

vi.mock('@/lib/invites/accept-invite', () => inviteLibMock);

describe('accept invite page UI states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inviteLibMock.findPendingInviteByToken.mockResolvedValue({ user: { name: 'Mock User' } });
    inviteLibMock.mapAcceptInviteErrorToUiMessage.mockReturnValue('Readable error for user');
  });

  test('shows user-visible error message when acceptance fails', async () => {
    const { default: AcceptInvitePage } = await import('@/app/accept-invite/[token]/page');
    const element = await AcceptInvitePage({
      params: { token: 'abc123' },
      searchParams: { error: 'INTERNAL_ERROR' }
    });

    const html = renderToStaticMarkup(element as any);
    expect(html).toContain('Readable error for user');
    expect(html).toContain('role="alert"');
  });

  test('shows success state after activation', async () => {
    const { default: AcceptInvitePage } = await import('@/app/accept-invite/[token]/page');
    const element = await AcceptInvitePage({
      params: { token: 'abc123' },
      searchParams: { accepted: '1' }
    });

    const html = renderToStaticMarkup(element as any);
    expect(html).toContain('Account activated');
    expect(html).toContain('/login');
  });
});
