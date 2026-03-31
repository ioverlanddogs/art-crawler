import { describe, expect, test } from 'vitest';
import { calculateDuplicateBacklog } from '@/lib/admin/data-health';
import { filterByScope, parseAdminScope, resolveScopeContext, withScopeQuery } from '@/lib/admin/scope';

describe('admin scope controls', () => {
  test('scope selector state resolves from query and defaults to global', () => {
    expect(parseAdminScope(undefined)).toBe('global');
    expect(parseAdminScope('team')).toBe('team');
    expect(parseAdminScope('bad-value')).toBe('global');

    const ctx = resolveScopeContext(new URLSearchParams('scope=reviewer-owned'), 'rev-7');
    expect(ctx).toEqual({ scope: 'reviewer-owned', reviewerId: 'rev-7' });
  });

  test('queue filtering applies team/workspace/source-group/reviewer-owned filters', () => {
    const rows = [
      { id: 'a', assignedReviewerId: 'rev-1', workspaceId: 'ws-1', sourceType: 'calendar' },
      { id: 'b', assignedReviewerId: null, workspaceId: null, sourceType: null },
      { id: 'c', assignedReviewerId: 'rev-2', workspaceId: null, sourceType: 'ticketing' }
    ];

    expect(filterByScope(rows, { scope: 'team' }, (row) => ({ assignedReviewerId: row.assignedReviewerId })).map((r) => r.id)).toEqual(['a', 'c']);
    expect(filterByScope(rows, { scope: 'workspace' }, (row) => ({ workspaceId: row.workspaceId })).map((r) => r.id)).toEqual(['a']);
    expect(filterByScope(rows, { scope: 'source-group' }, (row) => ({ sourceType: row.sourceType })).map((r) => r.id)).toEqual(['a', 'c']);
    expect(filterByScope(rows, { scope: 'reviewer-owned', reviewerId: 'rev-1' }, (row) => ({ assignedReviewerId: row.assignedReviewerId })).map((r) => r.id)).toEqual(['a']);
    expect(filterByScope(rows, { scope: 'reviewer-owned' }, (row) => ({ assignedReviewerId: row.assignedReviewerId }))).toEqual([]);
  });

  test('dashboard duplicate backlog aggregation is scope-aware', () => {
    const rows = [
      { source: 'feed-a', resolutionStatus: 'unresolved' as const, matchConfidence: 0.92, unresolvedBlockerCount: 2, conflictingSourceCount: 1, createdAt: new Date('2026-03-20T00:00:00.000Z'), assignedReviewerId: 'rev-1', sourceType: 'calendar' },
      { source: 'feed-b', resolutionStatus: 'unresolved' as const, matchConfidence: 0.4, unresolvedBlockerCount: 0, conflictingSourceCount: 0, createdAt: new Date('2026-03-30T00:00:00.000Z'), assignedReviewerId: null, sourceType: null }
    ];

    const scopedRows = filterByScope(rows, { scope: 'team' }, (row) => ({ assignedReviewerId: row.assignedReviewerId }));
    const summary = calculateDuplicateBacklog(scopedRows.map((row) => ({ ...row, sourceUrl: null })));
    expect(summary.mergeDistribution.unresolved).toBe(1);
    expect(summary.unresolvedBySeverity.critical).toBe(1);
  });

  test('audit continuity retains scoped ownership context metadata', () => {
    const href = withScopeQuery('/audit?entityType=Event&entityId=evt-1', 'workspace');
    expect(href).toContain('scope=workspace');

    const rows = [
      { actorUserId: 'admin-1', metadata: { scope: 'team', reviewerId: 'rev-2', workspaceId: 'ws-3', sourceGroup: 'tickets', escalationOwnerId: 'ops-1' } }
    ];
    const filtered = filterByScope(rows, { scope: 'team' }, (row) => ({
      assignedReviewerId: (row.metadata as any).reviewerId,
      workspaceId: (row.metadata as any).workspaceId,
      sourceGroup: (row.metadata as any).sourceGroup
    }));

    expect(filtered[0]?.actorUserId).toBe('admin-1');
    expect((filtered[0]?.metadata as any).escalationOwnerId).toBe('ops-1');
  });
});
