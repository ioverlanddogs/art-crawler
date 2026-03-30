import type { ReactNode } from 'react';
import { getServerSession } from 'next-auth';
import { AdminShell, type AdminEnvironment, type AdminNavGroup } from '@/components/admin';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const [session, pendingCount, failureCount24h] = await Promise.all([
    getServerSession(authOptions),
    prisma.candidate.count({ where: { status: 'PENDING' } }),
    prisma.pipelineTelemetry.count({ where: { status: 'failure', createdAt: { gte: inLast24Hours() } } })
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

  const environment = resolveEnvironment();

  return (
    <AdminShell
      navGroups={navGroups}
      environment={environment}
      user={{
        name: session?.user?.name,
        email: session?.user?.email,
        role: session?.user?.role
      }}
      opsSignals={{ pendingCount, failureCount24h }}
    >
      {children}
    </AdminShell>
  );
}

function inLast24Hours() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

function resolveEnvironment(): AdminEnvironment {
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv === 'production') return 'production';
  if (vercelEnv === 'preview') return 'preview';
  if (process.env.NODE_ENV === 'development') return 'development';
  return 'unknown';
}
