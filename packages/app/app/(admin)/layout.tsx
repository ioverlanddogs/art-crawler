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
        { href: '/dashboard', label: 'Dashboard' },
        { href: '/moderation', label: 'Moderation Queue', badgeCount: pendingCount },
        { href: '/pipeline', label: 'Pipeline' }
      ]
    },
    {
      label: 'Data',
      items: [
        { href: '/data', label: 'Data Quality' },
        { href: '/discovery', label: 'Discovery' }
      ]
    },
    {
      label: 'Configuration',
      items: [
        { href: '/config', label: 'Config Versions' },
        { href: '/system', label: 'System Health' }
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
