import NextAuth from 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      role: 'viewer' | 'moderator' | 'operator' | 'admin';
      status: 'ACTIVE' | 'PENDING' | 'SUSPENDED';
    };
  }

  interface User {
    role: 'viewer' | 'moderator' | 'operator' | 'admin';
    status: 'ACTIVE' | 'PENDING' | 'SUSPENDED';
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: 'viewer' | 'moderator' | 'operator' | 'admin';
    status?: 'ACTIVE' | 'PENDING' | 'SUSPENDED';
  }
}
