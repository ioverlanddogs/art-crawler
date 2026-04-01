import { beforeEach, describe, expect, test, vi } from 'vitest';
import fs from 'node:fs/promises';

const nextMock = vi.fn(() => ({ kind: 'next' }));
const redirectMock = vi.fn((url: URL) => ({ kind: 'redirect', location: url.toString() }));
const jsonMock = vi.fn((body: unknown, init?: ResponseInit) => ({ kind: 'json', body, status: init?.status ?? 200 }));
const getTokenMock = vi.fn();

vi.mock('next/server', () => ({
  NextResponse: {
    next: nextMock,
    redirect: redirectMock,
    json: jsonMock
  }
}));

vi.mock('next-auth/jwt', () => ({
  getToken: getTokenMock
}));

describe('auth middleware and login route consistency', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getTokenMock.mockReset();
    nextMock.mockClear();
    redirectMock.mockClear();
    jsonMock.mockClear();
    process.env.NEXTAUTH_SECRET = 'test-secret';
  });

  test('middleware denies access when NEXTAUTH_SECRET is missing', async () => {
    delete process.env.NEXTAUTH_SECRET;
    getTokenMock.mockResolvedValueOnce({ status: 'ACTIVE' });
    const { default: middleware } = await import('@/middleware');

    const response = await middleware({
      url: 'https://app.example.com/dashboard',
      nextUrl: { pathname: '/dashboard', search: '' }
    } as never);

    expect(response).toEqual({
      kind: 'redirect',
      location: 'https://app.example.com/login?callbackUrl=%2Fdashboard'
    });
  });

  test('middleware fails closed with 401 JSON for admin API requests when NEXTAUTH_SECRET is missing', async () => {
    delete process.env.NEXTAUTH_SECRET;
    getTokenMock.mockResolvedValueOnce({ status: 'ACTIVE' });
    const { default: middleware } = await import('@/middleware');

    const response = await middleware({
      url: 'https://app.example.com/api/admin/moderation/queue',
      nextUrl: { pathname: '/api/admin/moderation/queue', search: '' }
    } as never);

    expect(response).toEqual({ kind: 'json', body: { error: 'Unauthorized' }, status: 401 });
  });

  test('middleware redirects anonymous users to login with callbackUrl', async () => {
    getTokenMock.mockResolvedValueOnce(null);
    const { default: middleware } = await import('@/middleware');

    const response = await middleware({
      url: 'https://app.example.com/dashboard?tab=ops',
      nextUrl: { pathname: '/dashboard', search: '?tab=ops' }
    } as never);

    expect(response).toEqual({
      kind: 'redirect',
      location: 'https://app.example.com/login?callbackUrl=%2Fdashboard%3Ftab%3Dops'
    });
  });

  test('middleware allows requests when a valid ACTIVE auth token is present', async () => {
    getTokenMock.mockResolvedValueOnce({ status: 'ACTIVE' });
    const { default: middleware } = await import('@/middleware');

    const response = await middleware({
      url: 'https://app.example.com/dashboard',
      nextUrl: { pathname: '/dashboard', search: '' }
    } as never);

    expect(response).toEqual({ kind: 'next' });
  });

  test('middleware rejects token payloads without ACTIVE status', async () => {
    getTokenMock.mockResolvedValueOnce({ status: 'PENDING' });
    const { default: middleware } = await import('@/middleware');

    const response = await middleware({
      url: 'https://app.example.com/dashboard',
      nextUrl: { pathname: '/dashboard', search: '' }
    } as never);

    expect(response).toEqual({
      kind: 'redirect',
      location: 'https://app.example.com/login?callbackUrl=%2Fdashboard'
    });
  });

  test('middleware matcher excludes auth and non-admin API routes', async () => {
    const { config } = await import('@/middleware');

    expect(config.matcher).toEqual(['/((?!login|accept-invite|api/auth|_next/static|_next/image|favicon\\.ico).*)', '/api/admin/:path*']);
  });

  test('middleware returns 401 JSON for protected admin API routes when unauthenticated', async () => {
    getTokenMock.mockResolvedValueOnce(null);
    const { default: middleware } = await import('@/middleware');

    const response = await middleware({
      url: 'https://app.example.com/api/admin/moderation/queue',
      nextUrl: { pathname: '/api/admin/moderation/queue', search: '' }
    } as never);

    expect(response).toEqual({ kind: 'json', body: { error: 'Unauthorized' }, status: 401 });
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
