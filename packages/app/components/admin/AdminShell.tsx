'use client';

import { Fragment, type ReactNode } from 'react';
import { useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ADMIN_SCOPE_VALUES, parseAdminScope, withScopeQuery } from '@/lib/admin/scope';
import { AccountMenu } from './AccountMenu';
import { ScopeBadge } from './ScopeBadge';
import type { AdminEnvironment, AdminNavGroup, AdminUserInfo } from './types';

function pageTitleFromPath(pathname: string, navGroups: AdminNavGroup[]): string {
  for (const group of navGroups) {
    for (const item of group.items) {
      const isMatch = item.href === '/'
        ? pathname === '/'
        : pathname === item.href || pathname.startsWith(item.href + '/');
      if (isMatch) return item.label;
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

const SCOPE_LABELS = {
  global: 'Global',
  team: 'Team',
  workspace: 'Workspace',
  'source-group': 'Source group',
  'reviewer-owned': 'Reviewer owned'
} as const;

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
  const PRIMARY_NAV_HREFS = new Set([
    '/dashboard', '/inspect', '/search', '/venues', '/intake',
    '/moderation', '/publish', '/artists', '/artworks'
  ]);

  const SECONDARY_DIVIDER_BEFORE = new Set(['/duplicates']);
  const router = useRouter();
  const searchParams = useSearchParams();
  const scope = parseAdminScope(searchParams.get('scope') ?? undefined);
  const scopedNavGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.roles?.length || item.roles.includes(user?.role || ''))
    }))
    .filter((group) => group.items.length > 0);
  const pageTitle = pageTitleFromPath(pathname, scopedNavGroups);
  const visibleHrefs = useMemo(() => new Set(scopedNavGroups.flatMap((group) => group.items.map((item) => item.href))), [scopedNavGroups]);
  const canOpenModeration = visibleHrefs.has('/moderation');
  const canInvestigate = visibleHrefs.has('/investigations');

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

  const onScopeChange = (nextScope: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('scope', nextScope);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="brand">Artio Admin</div>
        <div className="role-chip">{roleLabel(user?.role)}</div>
        <div className="tenant-selector" role="region" aria-label="Workspace scope selector">
          <label htmlFor="admin-scope-selector" className="muted tenant-selector-label">
            Workspace scope
          </label>
          <select id="admin-scope-selector" className="select" value={scope} onChange={(event) => onScopeChange(event.target.value)}>
            {ADMIN_SCOPE_VALUES.map((scopeOption) => (
              <option value={scopeOption} key={scopeOption}>
                {SCOPE_LABELS[scopeOption]}
              </option>
            ))}
          </select>
          <p className="kpi-note">All dashboard metrics, queues, blockers, publish governance, and audit views now follow this scope.</p>
        </div>
        {scopedNavGroups.map((group) => (
          <div key={group.label} className="nav-group">
            <p className="nav-group-label">{group.label}</p>
            <nav>
              {group.items.map((item) => {
                const active =
                  item.href === '/'
                    ? pathname === '/'
                    : pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <Fragment key={`nav-${item.href}`}>
                    {SECONDARY_DIVIDER_BEFORE.has(item.href) ? (
                      <hr key={`divider-${item.href}`} style={{
                        border: 'none',
                        borderTop: '1px solid var(--border)',
                        margin: '0.35rem 0'
                      }} />
                    ) : null}
                    <Link
                      key={item.href}
                      href={withScopeQuery(item.href, scope)}
                      className={`nav-link ${active ? 'active' : ''}`}
                      style={{
                        fontSize: PRIMARY_NAV_HREFS.has(item.href) ? 14 : 13,
                        color: active
                          ? '#122b89'
                          : PRIMARY_NAV_HREFS.has(item.href)
                            ? '#1f2937'
                            : 'var(--text-muted)'
                      }}
                    >
                      <span>{item.label}</span>
                      {typeof item.badgeCount === 'number' ? (
                        <span className="nav-badge">{item.badgeCount}</span>
                      ) : null}
                    </Link>
                  </Fragment>
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
              <ScopeBadge scope={scope} />
              <p className="kpi-note">Active scope: {SCOPE_LABELS[scope]}.</p>
            </div>
          </div>
          <div className="topbar-actions">
            <p className={`env-badge tone-${envTone}`}>Environment: {envLabel}</p>
            {canOpenModeration ? (
              <Link href={withScopeQuery('/moderation', scope)} className="action-button variant-secondary">
                Open Queue
              </Link>
            ) : null}
            {canInvestigate ? (
              <Link href={withScopeQuery('/investigations', scope)} className="action-button variant-secondary">
                Investigate
              </Link>
            ) : null}
            <AccountMenu name={user?.name} email={user?.email} role={user?.role} />
          </div>
        </header>
        <div className="admin-content">{children}</div>
      </main>
    </div>
  );
}
