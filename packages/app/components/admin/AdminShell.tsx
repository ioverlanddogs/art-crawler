'use client';

import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AccountMenu } from './AccountMenu';
import { ScopeBadge } from './ScopeBadge';
import { TenantScopeSelector } from './TenantScopeSelector';
import type { AdminEnvironment, AdminNavGroup, AdminUserInfo } from './types';

function pageTitleFromPath(pathname: string, navGroups: AdminNavGroup[]): string {
  for (const group of navGroups) {
    for (const item of group.items) {
      if (pathname === item.href) return item.label;
    }
  }
  return 'Admin';
}

function roleLabel(role?: string | null) {
  if (role === 'admin') return 'Administrator';
  if (role === 'operator') return 'Operator';
  if (role === 'moderator') return 'Moderator';
  if (role === 'viewer') return 'Viewer';
  return 'Unscoped';
}

const DEFAULT_SCOPE_OPTIONS = [
  {
    id: 'global-ops',
    label: 'Global Operations',
    level: 'global' as const,
    description: 'Global view across all tenants and teams. Use with caution for scope-sensitive actions.'
  },
  {
    id: 'tenant-north-america',
    label: 'Tenant: North America',
    level: 'tenant' as const,
    description: 'Tenant-level operations scope for North America workspace.'
  },
  {
    id: 'team-moderation-a',
    label: 'Team: Moderation Team A',
    level: 'team' as const,
    description: 'Team-level queue and assignment scope for Moderation Team A.'
  }
];

export function AdminShell({
  navGroups,
  user,
  environment,
  opsSignals,
  children
}: {
  navGroups: AdminNavGroup[];
  user?: AdminUserInfo;
  environment?: AdminEnvironment;
  opsSignals?: { pendingCount: number; failureCount24h: number };
  children: ReactNode;
}) {
  const pathname = usePathname();
  const scopedNavGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.roles?.length || item.roles.includes(user?.role || ''))
    }))
    .filter((group) => group.items.length > 0);
  const pageTitle = pageTitleFromPath(pathname, scopedNavGroups);
  const [activeScope, setActiveScope] = useState(DEFAULT_SCOPE_OPTIONS[0].id);
  const activeScopeMeta = useMemo(() => DEFAULT_SCOPE_OPTIONS.find((option) => option.id === activeScope) ?? DEFAULT_SCOPE_OPTIONS[0], [activeScope]);

  const envLabel =
    environment === 'production'
      ? 'Production'
      : environment === 'preview'
        ? 'Preview'
        : environment === 'development'
          ? 'Development'
          : 'Unknown';
  const envTone =
    environment === 'production' ? 'danger' : environment === 'preview' ? 'warning' : environment === 'development' ? 'info' : 'neutral';

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="brand">Artio Admin</div>
        <div className="role-chip">{roleLabel(user?.role)}</div>
        <TenantScopeSelector options={DEFAULT_SCOPE_OPTIONS} selected={activeScope} onChange={setActiveScope} />
        <p className="kpi-note">
          Current scope: <strong>{activeScopeMeta.label}</strong>
        </p>
        {scopedNavGroups.map((group) => (
          <div key={group.label} className="nav-group">
            <p className="nav-group-label">{group.label}</p>
            <nav>
              {group.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link key={item.href} href={item.href} className={`nav-link ${active ? 'active' : ''}`}>
                    <span>{item.label}</span>
                    {typeof item.badgeCount === 'number' ? <span className="nav-badge">{item.badgeCount}</span> : null}
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
      </aside>
      <main className="admin-main">
        <header className="admin-topbar">
          <div>
            <p className="admin-kicker">Admin Console</p>
            <p className="admin-title">{pageTitle}</p>
            <p className="muted">
              Queue {typeof opsSignals?.pendingCount === 'number' ? opsSignals.pendingCount : 'N/A'} · Failures(24h){' '}
              {typeof opsSignals?.failureCount24h === 'number' ? opsSignals.failureCount24h : 'N/A'}
            </p>
            <div className="filters-row">
              <ScopeBadge scope={activeScopeMeta.level} />
              <p className="kpi-note">Scope-safe mode: actions in this console should be interpreted as {activeScopeMeta.level}-scoped unless explicitly labeled global.</p>
            </div>
          </div>
          <div className="topbar-actions">
            <p className={`env-badge tone-${envTone}`}>Environment: {envLabel}</p>
            <Link href="/moderation" className="action-button variant-secondary">
              Open Queue
            </Link>
            <Link href="/investigations" className="action-button variant-secondary">
              Investigate
            </Link>
            <AccountMenu name={user?.name} email={user?.email} role={user?.role} />
          </div>
        </header>
        <div className="admin-content">{children}</div>
      </main>
    </div>
  );
}
