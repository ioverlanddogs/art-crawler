import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { prisma } from './db';
import { isDatabaseRuntimeReady } from './runtime-env';
import { getGoogleClientId, getGoogleClientSecret } from './env';

const databaseReady = isDatabaseRuntimeReady();

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

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

      const email = normaliseEmail(user.email);
      const adminUser = await prisma.adminUser.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
        select: { id: true, status: true }
      });

      if (!adminUser || adminUser.status !== 'ACTIVE') {
        return false;
      }

      await prisma.adminUser.update({
        where: { id: adminUser.id },
        data: { lastLoginAt: new Date() }
      });

      return true;
    },
    async session({ session, user }) {
      if (!databaseReady || !session.user || !user?.id) return session;

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
