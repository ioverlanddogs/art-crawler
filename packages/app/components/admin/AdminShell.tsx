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

export function AdminShell({
  navGroups,
  user,
  children
}: {
  navGroups: AdminNavGroup[];
  user?: AdminUserInfo;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const pageTitle = pageTitleFromPath(pathname, navGroups);

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="brand">Artio Admin</div>
        {navGroups.map((group) => (
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
          </div>
          <div className="user-pill">
            <p>{user?.name || user?.email || 'Unknown User'}</p>
            <span>{user?.role || 'No Role'}</span>
          </div>
        </header>
        <div className="admin-content">{children}</div>
      </main>
    </div>
  );
}
