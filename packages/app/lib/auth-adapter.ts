import type { Adapter, AdapterAccount, AdapterSession, AdapterUser, VerificationToken } from 'next-auth/adapters';
import { prisma } from './db';

function mapAdminUserToAdapterUser(user: {
  id: string;
  name: string | null;
  email: string;
  role?: 'viewer' | 'moderator' | 'operator' | 'admin';
  status?: 'ACTIVE' | 'PENDING' | 'SUSPENDED';
}): AdapterUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: null,
    role: user.role ?? 'viewer',
    status: user.status ?? 'PENDING'
  };
}

export function createAdminPrismaAdapter(): Adapter {
  return {
    async createUser() {
      throw new Error('Admin accounts must be provisioned via invite flow before OAuth sign-in.');
    },
    async getUser(id) {
      const user = await prisma.adminUser.findUnique({
        where: { id },
        select: { id: true, name: true, email: true, role: true, status: true }
      });

      return user ? mapAdminUserToAdapterUser(user) : null;
    },
    async getUserByEmail(email) {
      const user = await prisma.adminUser.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
        select: { id: true, name: true, email: true, role: true, status: true }
      });

      return user ? mapAdminUserToAdapterUser(user) : null;
    },
    async getUserByAccount({ provider, providerAccountId }) {
      const account = await prisma.account.findUnique({
        where: { provider_providerAccountId: { provider, providerAccountId } },
        include: { user: { select: { id: true, name: true, email: true, role: true, status: true } } }
      });

      return account?.user ? mapAdminUserToAdapterUser(account.user) : null;
    },
    async updateUser(user) {
      const updated = await prisma.adminUser.update({
        where: { id: user.id },
        data: { name: user.name ?? null, email: user.email },
        select: { id: true, name: true, email: true, role: true, status: true }
      });

      return mapAdminUserToAdapterUser(updated);
    },
    async deleteUser(id) {
      await prisma.adminUser.delete({ where: { id } });
    },
    async linkAccount(account: AdapterAccount) {
      const created = await prisma.account.create({
        data: {
          userId: account.userId,
          type: account.type,
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          refresh_token: account.refresh_token,
          access_token: account.access_token,
          expires_at: account.expires_at,
          token_type: account.token_type,
          scope: account.scope,
          id_token: account.id_token,
          session_state: typeof account.session_state === 'string' ? account.session_state : null
        }
      });

      return created as AdapterAccount;
    },
    async unlinkAccount({ provider, providerAccountId }: Pick<AdapterAccount, 'provider' | 'providerAccountId'>) {
      await prisma.account.delete({
        where: { provider_providerAccountId: { provider, providerAccountId } }
      });
    },
    async createSession(session) {
      const created = await prisma.session.create({ data: session });
      return created as AdapterSession;
    },
    async getSessionAndUser(sessionToken) {
      const session = await prisma.session.findUnique({
        where: { sessionToken },
        include: { user: { select: { id: true, name: true, email: true, role: true, status: true } } }
      });

      if (!session) return null;

      return {
        session: {
          sessionToken: session.sessionToken,
          userId: session.userId,
          expires: session.expires
        },
        user: mapAdminUserToAdapterUser(session.user)
      };
    },
    async updateSession(session) {
      const updated = await prisma.session.update({
        where: { sessionToken: session.sessionToken },
        data: {
          expires: session.expires,
          userId: session.userId
        }
      });

      return updated as AdapterSession;
    },
    async deleteSession(sessionToken) {
      await prisma.session.delete({ where: { sessionToken } });
    },
    async createVerificationToken(token) {
      const created = await prisma.verificationToken.create({ data: token });
      return created as VerificationToken;
    },
    async useVerificationToken({ identifier, token }) {
      try {
        const deleted = await prisma.verificationToken.delete({
          where: { identifier_token: { identifier, token } }
        });
        return deleted as VerificationToken;
      } catch {
        return null;
      }
    }
  };
}
