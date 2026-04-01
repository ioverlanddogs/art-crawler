import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { prisma } from './db';
import { isDatabaseRuntimeReady } from './runtime-env';
import { isLoginRateLimited, recordLoginAttempt, clearLoginAttempts } from './auth/login-rate-limiter';

const databaseReady = isDatabaseRuntimeReady();

export const authOptions: NextAuthOptions = {
  adapter: databaseReady ? PrismaAdapter(prisma) : undefined,
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 }, // 8 hours
  pages: { signIn: '/login' },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        if (!databaseReady) return null;
        if (!credentials?.email || !credentials.password) return null;

        if (await isLoginRateLimited(credentials.email)) {
          return null;
        }

        const user = await prisma.adminUser.findUnique({
          where: { email: credentials.email }
        });

        if (!user?.passwordHash || user.status !== 'ACTIVE') {
          await recordLoginAttempt(credentials.email);
          return null;
        }

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) {
          await recordLoginAttempt(credentials.email);
          return null;
        }

        await clearLoginAttempts(credentials.email);

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
        };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.role = user.role;
        token.status = user.status;
        return token;
      }

      if (trigger === 'update' && token.sub && databaseReady) {
        const freshUser = await prisma.adminUser.findUnique({
          where: { id: token.sub },
          select: { email: true, name: true, role: true, status: true }
        });
        if (freshUser) {
          token.email = freshUser.email;
          token.name = freshUser.name;
          token.role = freshUser.role;
          token.status = freshUser.status;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (!session.user || !token?.sub) return session;

      session.user.id = token.sub;
      session.user.role = (token.role as typeof session.user.role) ?? 'viewer';
      session.user.status = (token.status as typeof session.user.status) ?? 'PENDING';
      session.user.email = token.email;
      session.user.name = token.name;
      return session;
    }
  }
};
