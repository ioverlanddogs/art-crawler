import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const SESSION_COOKIE_NAMES = ['__Secure-next-auth.session-token', 'next-auth.session-token'];

function hasSessionCookie(request: NextRequest): boolean {
  return SESSION_COOKIE_NAMES.some((cookieName) => {
    const cookie = request.cookies.get(cookieName);
    return typeof cookie?.value === 'string' && cookie.value.length > 0;
  });
}

export default function middleware(request: NextRequest) {
  if (hasSessionCookie(request)) {
    return NextResponse.next();
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('callbackUrl', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!login|accept-invite|api|_next/static|_next/image|favicon\\.ico).*)']
};
