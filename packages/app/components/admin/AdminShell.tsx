'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { AdminNavGroup, AdminUserInfo } from './types';

function pageTitleFromPath(pathname: string, navGroups: AdminNavGroup[]): string {
  for (const group of navGroups) {
    for (const item of group.items) {
      if (pathname === item.href) return item.label;
    }
  }
  return 'Admin';
}

function roleLabel(role?: string | null) {
  if (role === 'ADMIN') return 'Administrator';
  if (role === 'ANALYST') return 'Operator';
  if (role === 'REVIEWER') return 'Moderator';
  return 'Unscoped';
}

export function AdminShell({
  navGroups,
  user,
  opsSignals,
  children
}: {
  navGroups: AdminNavGroup[];
  user?: AdminUserInfo;
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

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="brand">Artio Admin</div>
        <div className="role-chip">{roleLabel(user?.role)}</div>
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
              Queue {opsSignals?.pendingCount ?? 0} · Failures(24h) {opsSignals?.failureCount24h ?? 0}
            </p>
          </div>
          <div className="topbar-actions">
            <Link href="/moderation" className="action-button variant-secondary">
              Open Queue
            </Link>
            <Link href="/investigations" className="action-button variant-secondary">
              Investigate
            </Link>
            <div className="user-pill">
              <p>{user?.name || user?.email || 'Unknown User'}</p>
              <span>{user?.role || 'No Role'}</span>
            </div>
          </div>
        </header>
        <div className="admin-content">{children}</div>
      </main>
    </div>
  );
}
