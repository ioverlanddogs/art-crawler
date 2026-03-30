import type { ReactNode } from 'react';
import { getServerSession } from 'next-auth';
import { AdminShell, type AdminNavGroup } from '@/components/admin';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const [session, pendingCount] = await Promise.all([
    getServerSession(authOptions),
    prisma.candidate.count({ where: { status: 'PENDING' } })
  ]);

  const navGroups: AdminNavGroup[] = [
    {
      label: 'Operations',
      items: [
        { href: '/dashboard', label: 'Dashboard', roles: ['ADMIN', 'ANALYST', 'REVIEWER'] },
        { href: '/moderation', label: 'Moderation Queue', badgeCount: pendingCount, roles: ['ADMIN', 'REVIEWER'] },
        { href: '/pipeline', label: 'Pipeline', roles: ['ADMIN', 'ANALYST'] }
      ]
    },
    {
      label: 'Investigations',
      items: [
        { href: '/investigations', label: 'Case Workspace', roles: ['ADMIN', 'ANALYST', 'REVIEWER'] },
        { href: '/data', label: 'Data Quality', roles: ['ADMIN', 'ANALYST'] },
        { href: '/discovery', label: 'Discovery', roles: ['ADMIN', 'ANALYST'] }
      ]
    },
    {
      label: 'Configuration',
      items: [
        { href: '/config', label: 'Config & Models', roles: ['ADMIN', 'ANALYST'] },
        { href: '/system', label: 'System Health', roles: ['ADMIN', 'ANALYST'] }
      ]
    }
  ];

  return (
    <AdminShell
      navGroups={navGroups}
      user={{
        name: session?.user?.name,
        email: session?.user?.email,
        role: session?.user?.role
      }}
    >
      {children}
    </AdminShell>
  );
}
