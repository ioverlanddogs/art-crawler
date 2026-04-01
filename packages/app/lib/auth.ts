import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { prisma } from './db';
import { isDatabaseRuntimeReady } from './runtime-env';
import { getGoogleClientId, getGoogleClientSecret } from './env';

const databaseReady = isDatabaseRuntimeReady();

export const authOptions: NextAuthOptions = {
  adapter: databaseReady ? PrismaAdapter(prisma) : undefined,
  session: { strategy: 'database' },
  pages: { signIn: '/login' },
  providers: [
    GoogleProvider({
      clientId: getGoogleClientId() ?? '',
      clientSecret: getGoogleClientSecret() ?? ''
    })
  ],
  callbacks: {
    async signIn({ user }) {
      if (!databaseReady) return false;
      if (!user.email) return false;

      const adminUser = await prisma.adminUser.findUnique({
        where: { email: user.email },
        select: { status: true }
      });

      return adminUser?.status === 'ACTIVE';
    },
    async session({ session, user }) {
      if (!session.user || !user?.id) return session;

      const adminUser = await prisma.adminUser.findUnique({
        where: { id: user.id },
        select: { id: true, role: true, status: true, email: true, name: true }
      });

      if (!adminUser) return session;

      session.user.id = adminUser.id;
      session.user.role = adminUser.role;
      session.user.status = adminUser.status;
      session.user.email = adminUser.email;
      session.user.name = adminUser.name;

      return session;
    }
  }
};
