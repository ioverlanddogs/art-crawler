import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { isDatabaseRuntimeReady } from './runtime-env';
import { getGoogleClientId, getGoogleClientSecret, getApprovedGoogleEmail } from './env';
import { prisma } from './db';
import { createAdminPrismaAdapter } from './auth-adapter';
import { verifyPassword } from './password';
import { checkRateLimit, recordFailure, resetRateLimit } from './auth-rate-limit';

const databaseReady = isDatabaseRuntimeReady();
const googleClientId = getGoogleClientId();
const googleClientSecret = getGoogleClientSecret();
const googleProviderReady = Boolean(googleClientId && googleClientSecret);
const nextAuthSecretReady = typeof process.env.NEXTAUTH_SECRET === 'string' && process.env.NEXTAUTH_SECRET.trim().length > 0;

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const authOptions: NextAuthOptions = {
  adapter: databaseReady ? createAdminPrismaAdapter() : undefined,
  session: { strategy: 'jwt', maxAge: 60 * 60 * 8 },
  jwt: { maxAge: 60 * 60 * 8 },
  pages: { signIn: '/login' },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials: Record<string, string> | undefined) {
        if (!databaseReady || !nextAuthSecretReady || !credentials?.email || !credentials?.password) {
          return null;
        }

        const email = normaliseEmail(credentials.email);
        // TODO: replace with Redis-backed limiter before multi-instance deployment
        // (in-memory limits are per-process only — see import route for same note)
        const rateLimitCheck = checkRateLimit(email);
        if (!rateLimitCheck.allowed) {
          return null;
        }

        const adminUser = await prisma.adminUser.findFirst({
          where: { email: { equals: email, mode: 'insensitive' } },
          select: { id: true, email: true, name: true, role: true, status: true, passwordHash: true }
        });

        if (!adminUser || adminUser.status !== 'ACTIVE' || !adminUser.passwordHash) {
          return null;
        }

        const isValidPassword = await verifyPassword(credentials.password, adminUser.passwordHash);
        if (!isValidPassword) {
          recordFailure(email);
          return null;
        }

        resetRateLimit(email);

        await prisma.adminUser.update({
          where: { id: adminUser.id },
          data: { lastLoginAt: new Date() }
        });

        return {
          id: adminUser.id,
          email: adminUser.email,
          name: adminUser.name,
          role: adminUser.role,
          status: adminUser.status
        };
      }
    }),
    ...(googleProviderReady
      ? [
          GoogleProvider({
            clientId: googleClientId as string,
            clientSecret: googleClientSecret as string
          })
        ]
      : [])
  ],
  callbacks: {
    async signIn({ user, account }) {
      // Credentials: authorize() has already verified everything
      if (account?.provider === 'credentials') return true;

      if (!databaseReady || !googleProviderReady || !nextAuthSecretReady || !user.email) return false;

      const email = normaliseEmail(user.email);

      // Env-var approved email: upsert AdminUser on first sign-in, no invite required
      const approvedEmail = getApprovedGoogleEmail();
      if (approvedEmail && email === approvedEmail) {
        await prisma.adminUser.upsert({
          where: { email },
          create: {
            email,
            name: user.name ?? null,
            role: 'admin',
            status: 'ACTIVE'
          },
          update: {
            status: 'ACTIVE',
            lastLoginAt: new Date()
          }
        });
        return true;
      }

      // Existing invite flow: email must match a pre-existing ACTIVE AdminUser row
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
    async jwt({ token, user }) {
      if (!databaseReady) return token;

      const adminUserId = user?.id ?? token.sub;
      const adminUserEmail = user?.email ?? token.email;

      if (!adminUserId && !adminUserEmail) {
        return token;
      }

      const adminUser = await prisma.adminUser.findFirst({
        where: {
          OR: [
            ...(adminUserId ? [{ id: adminUserId }] : []),
            ...(adminUserEmail ? [{ email: { equals: normaliseEmail(adminUserEmail), mode: 'insensitive' as const } }] : [])
          ]
        },
        select: { id: true, role: true, status: true, email: true, name: true }
      });

      if (!adminUser) {
        token.role = 'viewer';
        token.status = 'SUSPENDED';
        return token;
      }

      token.sub = adminUser.id;
      token.email = adminUser.email;
      token.name = adminUser.name;
      token.role = adminUser.role;
      token.status = adminUser.status;

      return token;
    },
    async session({ session, token }) {
      if (!session.user) return session;

      if (token.sub) {
        session.user.id = token.sub;
      }

      if (typeof token.email === 'string') {
        session.user.email = token.email;
      }

      if (typeof token.name === 'string' || token.name === null) {
        session.user.name = token.name;
      }

      session.user.role = token.role === 'viewer' || token.role === 'moderator' || token.role === 'operator' || token.role === 'admin' ? token.role : 'viewer';
      session.user.status = token.status === 'ACTIVE' || token.status === 'PENDING' || token.status === 'SUSPENDED' ? token.status : 'PENDING';

      return session;
    }
  }
};
