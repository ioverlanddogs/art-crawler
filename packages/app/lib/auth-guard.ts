import { getServerSession } from 'next-auth';
import type { Session } from 'next-auth';
import { authOptions } from './auth';

export const ADMIN_ROLES = ['viewer', 'moderator', 'operator', 'admin'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export async function requireRole(roles: AdminRole[]): Promise<Session> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    throw new Response('Unauthorized', { status: 401 });
  }

  if (!roles.includes(session.user.role) || session.user.status !== 'ACTIVE') {
    throw new Response('Forbidden', { status: 403 });
  }

  return session;
}

export async function requireAdminSession(): Promise<Session> {
  return requireRole([...ADMIN_ROLES]);
}
