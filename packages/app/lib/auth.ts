import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { prisma } from './db';

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'database' },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null;

        const user = await prisma.adminUser.findUnique({ where: { email: credentials.email } });
        if (!user?.passwordHash || user.status !== 'ACTIVE') return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        await prisma.adminUser.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() }
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          status: user.status
        } as any;
      }
    })
  ],
  callbacks: {
    async session({ session, user }) {
      if (!session.user || !user?.id) return session;

      const freshUser = await prisma.adminUser.findUnique({ where: { id: user.id } });
      if (!freshUser) return session;

      session.user.id = freshUser.id;
      session.user.role = freshUser.role;
      session.user.status = freshUser.status;
      session.user.email = freshUser.email;
      session.user.name = freshUser.name;
      return session;
    }
  }
};
