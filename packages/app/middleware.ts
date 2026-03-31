import { withAuth } from 'next-auth/middleware';

export default withAuth({
  pages: {
    signIn: '/login'
  },
  callbacks: {
    authorized: ({ token }) => {
      if (!token) return false;
      return token.status === 'ACTIVE';
    }
  }
});

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/moderation/:path*',
    '/pipeline/:path*',
    '/data/:path*',
    '/discovery/:path*',
    '/config/:path*',
    '/system/:path*',
    '/investigations/:path*',
    '/api/admin/:path*'
  ]
};
