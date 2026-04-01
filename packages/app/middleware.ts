import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

async function hasValidSession(request: NextRequest): Promise<boolean> {
  const hasSecret = typeof process.env.NEXTAUTH_SECRET === 'string' && process.env.NEXTAUTH_SECRET.trim().length > 0;
  if (!hasSecret) return false;

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

  if (!token) return false;

  return token.status === 'ACTIVE';
}

export default async function middleware(request: NextRequest) {
  if (await hasValidSession(request)) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('callbackUrl', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!login|accept-invite|api/auth|_next/static|_next/image|favicon\\.ico).*)', '/api/admin/:path*']
};
