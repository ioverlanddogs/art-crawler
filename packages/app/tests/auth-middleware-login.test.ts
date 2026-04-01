import { describe, expect, test, vi } from 'vitest';
import fs from 'node:fs/promises';

const nextMock = vi.fn(() => ({ kind: 'next' }));
const redirectMock = vi.fn((url: URL) => ({ kind: 'redirect', location: url.toString() }));

vi.mock('next/server', () => ({
  NextResponse: {
    next: nextMock,
    redirect: redirectMock
  }
}));

describe('auth middleware and login route consistency', () => {
  test('middleware redirects anonymous users to login with callbackUrl', async () => {
    const { default: middleware } = await import('@/middleware');

    const response = middleware({
      url: 'https://app.example.com/dashboard?tab=ops',
      nextUrl: { pathname: '/dashboard', search: '?tab=ops' },
      cookies: { get: vi.fn().mockReturnValue(undefined) }
    } as never);

    expect(redirectMock).toHaveBeenCalledTimes(1);
    expect(response).toEqual({
      kind: 'redirect',
      location: 'https://app.example.com/login?callbackUrl=%2Fdashboard%3Ftab%3Dops'
    });
  });

  test('middleware allows requests when database session cookie is present', async () => {
    const { default: middleware } = await import('@/middleware');

    const response = middleware({
      url: 'https://app.example.com/dashboard',
      nextUrl: { pathname: '/dashboard', search: '' },
      cookies: { get: vi.fn((name: string) => (name === 'next-auth.session-token' ? { value: 'token' } : undefined)) }
    } as never);

    expect(nextMock).toHaveBeenCalledTimes(1);
    expect(response).toEqual({ kind: 'next' });
  });

  test('middleware matcher excludes auth and non-admin API routes', async () => {
    const { config } = await import('@/middleware');

    expect(config.matcher).toEqual(['/((?!login|accept-invite|api|_next/static|_next/image|favicon\\.ico).*)']);
  });

  test('login route uses Suspense page wrapper and delegates auth logic to LoginClient', async () => {
    const pageSource = await fs.readFile(new URL('../app/(auth)/login/page.tsx', import.meta.url), 'utf8');

    expect(pageSource).toContain("import { Suspense } from 'react'");
    expect(pageSource).toContain("import LoginClient from './LoginClient'");
    expect(pageSource).toContain('<Suspense fallback={<LoginFallback />}>');
    expect(pageSource).toContain('<LoginClient />');
  });

  test('LoginClient supports Google sign-in, callbackUrl handling, and access denied messaging', async () => {
    const loginClientSource = await fs.readFile(new URL('../app/(auth)/login/LoginClient.tsx', import.meta.url), 'utf8');

    expect(loginClientSource).toContain("signIn('google', { callbackUrl })");
    expect(loginClientSource).toContain("searchParams.get('callbackUrl') || DEFAULT_CALLBACK_URL");
    expect(loginClientSource).toContain("DEFAULT_CALLBACK_URL = '/dashboard'");
    expect(loginClientSource).toContain("error === 'AccessDenied'");
    expect(loginClientSource).toContain('ACTIVE admin user');
    expect(loginClientSource).toContain("searchParams.get('error')");
  });
});
