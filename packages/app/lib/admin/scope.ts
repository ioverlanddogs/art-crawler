export const ADMIN_SCOPE_VALUES = ['global', 'team', 'workspace', 'source-group', 'reviewer-owned'] as const;

export type AdminScope = (typeof ADMIN_SCOPE_VALUES)[number];

export type ScopeContext = {
  scope: AdminScope;
  reviewerId?: string;
};

export function parseAdminScope(value: string | undefined): AdminScope {
  if (!value) return 'global';
  return (ADMIN_SCOPE_VALUES as readonly string[]).includes(value) ? (value as AdminScope) : 'global';
}

export function resolveScopeContext(searchParams: URLSearchParams | Record<string, string | string[] | undefined> | undefined, reviewerId?: string): ScopeContext {
  const raw =
    searchParams instanceof URLSearchParams
      ? searchParams.get('scope') ?? undefined
      : asString(searchParams?.scope);
  return {
    scope: parseAdminScope(raw),
    reviewerId
  };
}

export function withScopeQuery(path: string, scope: AdminScope): string {
  const [base, query] = path.split('?');
  const params = new URLSearchParams(query ?? '');
  params.set('scope', scope);
  const rendered = params.toString();
  return rendered ? `${base}?${rendered}` : base;
}

export function matchesScope(
  context: ScopeContext,
  row: {
    assignedReviewerId?: string | null;
    reviewerId?: string | null;
    team?: string | null;
    workspaceId?: string | null;
    workspace?: string | null;
    sourceGroup?: string | null;
    sourceType?: string | null;
  }
): boolean {
  if (context.scope === 'global') return true;
  if (context.scope === 'team') return Boolean(row.team ?? row.assignedReviewerId ?? row.reviewerId);
  if (context.scope === 'workspace') return Boolean(row.workspaceId ?? row.workspace);
  if (context.scope === 'source-group') return Boolean(row.sourceGroup ?? row.sourceType);
  if (context.scope === 'reviewer-owned') {
    if (!context.reviewerId) return false;
    return (row.assignedReviewerId ?? row.reviewerId) === context.reviewerId;
  }
  return true;
}

export function filterByScope<T>(rows: T[], context: ScopeContext, mapRow: (row: T) => Parameters<typeof matchesScope>[1]): T[] {
  return rows.filter((row) => matchesScope(context, mapRow(row)));
}

function asString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
