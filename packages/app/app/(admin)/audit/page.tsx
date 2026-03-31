import { PageHeader } from '@/components/admin';
import { AuditLogTable, type AuditLogItem } from '@/components/admin/AuditLogTable';
import { requireRole } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { filterByScope, resolveScopeContext } from '@/lib/admin/scope';

export const dynamic = 'force-dynamic';

export default async function AuditPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const entityId = asString(searchParams?.entityId);
  const entityType = asString(searchParams?.entityType);
  const session = await requireRole(['viewer', 'moderator', 'operator', 'admin']);
  const scopeContext = resolveScopeContext(searchParams, session.user.id);
  const page = Math.max(1, Number.parseInt(asString(searchParams?.page) ?? '1', 10) || 1);
  const pageSize = 50;

  const eventVersionWhere: Record<string, unknown> = {};
  const changeSetWhere: Record<string, unknown> = { reviewStatus: { in: ['approved', 'merged', 'rejected'] } };
  const ingestionWhere: Record<string, unknown> = {};
  const telemetryWhere: Record<string, unknown> = {
    stage: {
      in: [
        'ai_extraction',
        'rollback',
        'duplicate_detected',
        'duplicate_resolved_merge',
        'duplicate_resolved_separate',
        'duplicate_false_positive',
        'corroboration_conflict'
      ]
    }
  };

  if (entityType === 'Event' && entityId) {
    eventVersionWhere.eventId = entityId;
    changeSetWhere.matchedEventId = entityId;
    telemetryWhere.entityType = 'Event';
    telemetryWhere.entityId = entityId;
  }
  if (entityType === 'SourceDocument' && entityId) {
    eventVersionWhere.sourceDocumentId = entityId;
    changeSetWhere.sourceDocumentId = entityId;
    ingestionWhere.sourceDocumentId = entityId;
    telemetryWhere.entityType = 'SourceDocument';
    telemetryWhere.entityId = entityId;
  }

  const [versions, changeSets, ingestionJobs, telemetry] = await Promise.all([
    prisma.canonicalRecordVersion.findMany({ where: eventVersionWhere }),
    prisma.proposedChangeSet.findMany({ where: changeSetWhere }),
    prisma.ingestionJob.findMany({ where: ingestionWhere }),
    prisma.pipelineTelemetry.findMany({ where: telemetryWhere })
  ]);

  const unified = [
    ...versions.map((row) => ({
      id: `version:${row.id}`,
      createdAt: row.createdAt.toISOString(),
      actor: row.createdByUserId ?? 'system',
      action: row.changeSummary?.toLowerCase().includes('rollback') ? 'rolled_back' : 'published',
      target: `Event ${row.eventId}`,
      reason: row.changeSummary ?? null,
      outcome: `Version ${row.versionNumber}`,
      rawDetail: JSON.stringify({ sourceDocumentId: row.sourceDocumentId, publishBatchId: row.publishBatchId, scope: 'workspace', workspaceId: row.eventId })
    })),
    ...changeSets.map((row) => ({
      id: `changeset:${row.id}`,
      createdAt: (row.reviewedAt ?? row.updatedAt).toISOString(),
      actor: row.reviewedByUserId ?? 'unknown',
      action: row.reviewStatus === 'rejected' ? 'rejected' : 'approved',
      target: row.matchedEventId ? `Event ${row.matchedEventId}` : `SourceDocument ${row.sourceDocumentId}`,
      reason: row.notes ?? null,
      outcome: row.reviewStatus,
      rawDetail: JSON.stringify({ sourceDocumentId: row.sourceDocumentId, matchedEventId: row.matchedEventId, scope: 'team', reviewerId: row.reviewedByUserId })
    })),
    ...ingestionJobs.map((row) => ({
      id: `ingestion:${row.id}`,
      createdAt: row.createdAt.toISOString(),
      actor: row.requestedByUserId ?? 'system',
      action: row.status === 'failed' ? 'intake_failed' : 'intake_started',
      target: `SourceDocument ${row.sourceDocumentId}`,
      reason: row.errorMessage ?? null,
      outcome: row.status,
      rawDetail: JSON.stringify({ errorCode: row.errorCode, scope: 'source-group', sourceGroup: 'intake' })
    })),
    ...telemetry.map((row) => ({
      id: `telemetry:${row.id}`,
      createdAt: row.createdAt.toISOString(),
      actor: 'system',
      action: row.stage === 'rollback' ? 'rollback_execution' : row.stage === 'ai_extraction' ? 'extraction_run' : row.stage,
      target: `${row.entityType ?? 'Unknown'} ${row.entityId ?? 'unknown'}`,
      reason: row.detail ?? null,
      outcome: row.status,
      rawDetail: JSON.stringify({ ...(row.metadata as Record<string, unknown> ?? {}), scope: (row.metadata as any)?.scope ?? 'global' })
    }))
  ];
  const scopedUnified = filterByScope(unified, scopeContext, (row) => {
    const detail = safelyParseDetail(row.rawDetail);
    return {
      assignedReviewerId: typeof detail.reviewerId === 'string' ? detail.reviewerId : null,
      sourceGroup: typeof detail.sourceGroup === 'string' ? detail.sourceGroup : null,
      workspaceId: typeof detail.workspaceId === 'string' ? detail.workspaceId : null
    };
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = scopedUnified.length;
  const rows: AuditLogItem[] = scopedUnified.slice((page - 1) * pageSize, page * pageSize);
  const hasNext = page * pageSize < total;

  return (
    <div className="stack">
      <PageHeader title="Audit history" description="Every intake, review, approval, and publish event." />

      <form className="filters-row" method="GET">
        <label className="stack" style={{ minWidth: 280 }}>
          <span className="muted">Entity ID</span>
          <input name="entityId" defaultValue={entityId ?? ''} className="input" placeholder="evt_..., src_..." />
        </label>
        <label className="stack" style={{ minWidth: 220 }}>
          <span className="muted">Entity type</span>
          <select name="entityType" defaultValue={entityType ?? ''} className="select">
            <option value="">All entities</option>
            <option value="Event">Event</option>
            <option value="SourceDocument">SourceDocument</option>
          </select>
        </label>
        <input type="hidden" name="page" value="1" />
        <button type="submit" className="action-button variant-secondary">
          Apply filters
        </button>
      </form>

      <AuditLogTable rows={rows} />

      <div className="filters-row" style={{ justifyContent: 'space-between' }}>
        <span className="muted">Page {page}</span>
        <div className="filters-row">
          {page > 1 ? <a className="action-button variant-secondary" href={buildHref(entityId, entityType, page - 1)}>Previous</a> : null}
          {hasNext ? <a className="action-button variant-secondary" href={buildHref(entityId, entityType, page + 1)}>Next</a> : null}
        </div>
      </div>
    </div>
  );
}

function safelyParseDetail(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function asString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function buildHref(entityId: string | undefined, entityType: string | undefined, page: number): string {
  const params = new URLSearchParams();
  if (entityId) params.set('entityId', entityId);
  if (entityType) params.set('entityType', entityType);
  params.set('page', String(page));
  return `/audit?${params.toString()}`;
}
