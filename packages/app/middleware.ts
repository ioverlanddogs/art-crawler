export { default } from 'next-auth/middleware';

const ADMIN_UI_MATCHERS = [
  '/dashboard/:path*',
  '/moderation/:path*',
  '/pipeline/:path*',
  '/data/:path*',
  '/discovery/:path*',
  '/config/:path*',
  '/system/:path*',
  '/investigations/:path*'
] as const;

export const config = {
  matcher: [...ADMIN_UI_MATCHERS, '/api/admin/:path*']
};
