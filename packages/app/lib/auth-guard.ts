import { getServerSession } from 'next-auth';
import type { Session } from 'next-auth';
import { authOptions } from './auth';

export async function requireRole(
  roles: Array<'viewer' | 'moderator' | 'operator' | 'admin'>
): Promise<Session> {
  const session = await getServerSession(authOptions);

  if (!session?.user || !roles.includes(session.user.role) || session.user.status !== 'ACTIVE') {
    throw new Response('Forbidden', { status: 403 });
  }

  return session;
}
