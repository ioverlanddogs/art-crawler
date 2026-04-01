import { getServerSession } from 'next-auth';
import type { Session } from 'next-auth';
import { authOptions } from './auth';
import { prisma } from './db';

export const ADMIN_ROLES = ['viewer', 'moderator', 'operator', 'admin'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

async function loadCurrentAdminUser(session: Session) {
  const sessionUserId = session.user.id;
  const sessionUserEmail = session.user.email?.trim().toLowerCase();

  if (!sessionUserId && !sessionUserEmail) {
    return null;
  }

  return prisma.adminUser.findFirst({
    where: {
      OR: [
        ...(sessionUserId ? [{ id: sessionUserId }] : []),
        ...(sessionUserEmail ? [{ email: { equals: sessionUserEmail, mode: 'insensitive' as const } }] : [])
      ]
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true
    }
  });
}

export async function requireRole(roles: AdminRole[]): Promise<Session> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    throw new Response('Unauthorized', { status: 401 });
  }

  const currentAdminUser = await loadCurrentAdminUser(session).catch(() => null);
  if (!currentAdminUser) {
    throw new Response('Unauthorized', { status: 401 });
  }

  if (currentAdminUser.status !== 'ACTIVE' || !roles.includes(currentAdminUser.role)) {
    throw new Response('Forbidden', { status: 403 });
  }

  session.user.id = currentAdminUser.id;
  session.user.email = currentAdminUser.email;
  session.user.name = currentAdminUser.name;
  session.user.role = currentAdminUser.role;
  session.user.status = currentAdminUser.status;

  return session;
}

export async function requireAdminSession(): Promise<Session> {
  return requireRole([...ADMIN_ROLES]);
}
