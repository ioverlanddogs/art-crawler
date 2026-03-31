import type { ReactNode } from 'react';
import { AdminShell, type AdminEnvironment, type AdminNavGroup } from '@/components/admin';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireAdminSession } from '@/lib/auth-guard';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  let session;
  try {
    session = await requireAdminSession();
  } catch (error) {
    if (error instanceof Response && error.status === 401) {
      redirect('/login');
    }
    redirect('/');
  }

  const [pendingCount, failureCount24h] = await Promise.all([
    prisma.ingestExtractedEvent.count({ where: { status: 'PENDING' } }),
    prisma.pipelineTelemetry.count({ where: { status: 'failure', createdAt: { gte: inLast24Hours() } } })
  ]);

  const navGroups: AdminNavGroup[] = [
    {
      label: 'Operations',
      items: [
        { href: '/dashboard', label: 'Dashboard', roles: ['admin', 'operator', 'moderator'] },
        { href: '/intake', label: 'Intake', roles: ['admin', 'operator', 'moderator'] },
        { href: '/batch-intake', label: 'Batch Intake', roles: ['admin', 'operator', 'moderator'] },
        { href: '/batch-review', label: 'Batch Review', roles: ['admin', 'operator', 'moderator'] },
        { href: '/moderation', label: 'Moderation Queue', badgeCount: pendingCount, roles: ['admin', 'moderator'] },
        { href: '/duplicates', label: 'Duplicates', roles: ['admin', 'operator', 'moderator'] },
        { href: '/publish', label: 'Publish', roles: ['admin', 'operator', 'moderator'] },
        { href: '/audit', label: 'Audit', roles: ['admin', 'operator', 'moderator', 'viewer'] },
        { href: '/pipeline', label: 'Pipeline', roles: ['admin', 'operator'] },
        { href: '/operations', label: 'Reviewer Ops', roles: ['admin', 'operator', 'moderator'] }
      ]
    },
    {
      label: 'Investigations',
      items: [
        { href: '/investigations', label: 'Case Workspace', roles: ['admin', 'operator', 'moderator'] },
        { href: '/recovery-studio', label: 'Recovery Studio', roles: ['admin', 'operator'] },
        { href: '/self-healing', label: 'Self-healing', roles: ['admin', 'operator'] },
        { href: '/data', label: 'Data Quality', roles: ['admin', 'operator'] },
        { href: '/discovery', label: 'Discovery', roles: ['admin', 'operator'] }
      ]
    },
    {
      label: 'Configuration',
      items: [
        { href: '/config', label: 'Config & Models', roles: ['admin', 'operator'] },
        { href: '/system', label: 'System Health', roles: ['admin', 'operator'] }
      ]
    }
  ];

  const environment = resolveEnvironment();

  return (
    <AdminShell
      navGroups={navGroups}
      environment={environment}
      user={{
        id: session?.user?.id,
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
