import { getServerSession } from 'next-auth';
import { authOptions } from './auth';

export async function requireRole(roles: string[]) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !roles.includes(session.user.role)) {
    throw new Error('Forbidden');
  }
  return session;
}
