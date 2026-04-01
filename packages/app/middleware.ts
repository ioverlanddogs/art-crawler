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
    '/((?!login|accept-invite|api/auth|_next/static|_next/image|favicon\\.ico).*)'
  ]
};
