import { authFailure } from '@/lib/api/response';
import { requireRole } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { filterByScope, resolveScopeContext } from '@/lib/admin/scope';

type AuditEvent = {
  id: string;
  eventType: string;
  entityId: string;
  entityType: string;
  actorUserId: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export const runtime = 'nodejs';

export async function GET(request: Request) {
  let session;
  try {
    session = await requireRole(['viewer', 'moderator', 'operator', 'admin']);
  } catch (error) {
    return authFailure(error);
  }

  const { searchParams } = new URL(request.url);
  const entityId = searchParams.get('entityId')?.trim() || undefined;
  const entityType = searchParams.get('entityType')?.trim() || undefined;
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('pageSize') ?? '50', 10) || 50));
  const scopeContext = resolveScopeContext(searchParams, session.user.id);

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

  if (!entityType && entityId) {
    ingestionWhere.sourceDocumentId = entityId;
  }

  const [versions, changeSets, ingestionJobs, telemetry] = await Promise.all([
    prisma.canonicalRecordVersion.findMany({ where: eventVersionWhere }),
    prisma.proposedChangeSet.findMany({ where: changeSetWhere }),
    prisma.ingestionJob.findMany({ where: ingestionWhere }),
    prisma.pipelineTelemetry.findMany({ where: telemetryWhere })
  ]);

  const unified: AuditEvent[] = [
    ...versions.map((row) => ({
      id: `version:${row.id}`,
      eventType: row.changeSummary?.toLowerCase().includes('rollback') ? 'rolled_back' : 'published',
      entityId: row.eventId,
      entityType: 'Event',
      actorUserId: row.createdByUserId ?? null,
      summary: row.changeSummary ?? `Canonical snapshot v${row.versionNumber}`,
      metadata: {
        versionNumber: row.versionNumber,
        sourceDocumentId: row.sourceDocumentId,
        proposedChangeSetId: row.proposedChangeSetId,
        publishBatchId: row.publishBatchId
      },
      createdAt: row.createdAt.toISOString()
    })),
    ...changeSets.map((row) => ({
      id: `changeset:${row.id}`,
      eventType: row.reviewStatus === 'rejected' ? 'rejected' : 'approved',
      entityId: row.matchedEventId ?? row.sourceDocumentId,
      entityType: row.matchedEventId ? 'Event' : 'SourceDocument',
      actorUserId: row.reviewedByUserId ?? null,
      summary: row.notes ?? `Change set ${row.reviewStatus}`,
      metadata: {
        changeSetId: row.id,
        reviewStatus: row.reviewStatus,
        sourceDocumentId: row.sourceDocumentId,
        matchedEventId: row.matchedEventId
      },
      createdAt: (row.reviewedAt ?? row.updatedAt).toISOString()
    })),
    ...ingestionJobs.map((row) => ({
      id: `ingestion:${row.id}`,
      eventType: row.status === 'failed' ? 'intake_failed' : 'intake_started',
      entityId: row.sourceDocumentId,
      entityType: 'SourceDocument',
      actorUserId: row.requestedByUserId ?? null,
      summary: `Ingestion job ${row.status}`,
      metadata: {
        status: row.status,
        errorCode: row.errorCode,
        errorMessage: row.errorMessage
      },
      createdAt: row.createdAt.toISOString()
    })),
    ...telemetry.map((row) => ({
      id: `telemetry:${row.id}`,
      eventType:
        row.stage === 'rollback'
          ? 'rollback_execution'
          : row.stage === 'ai_extraction'
            ? 'extraction_run'
            : row.stage,
      entityId: row.entityId ?? 'unknown',
      entityType: row.entityType ?? 'Unknown',
      actorUserId: null,
      summary: row.detail ?? `Pipeline extraction ${row.status}`,
      metadata: {
        stage: row.stage,
        status: row.status,
        configVersion: row.configVersion,
        durationMs: row.durationMs,
        metadata: row.metadata
      },
      createdAt: row.createdAt.toISOString()
    }))
  ];

  const filtered = filterByScope(unified, scopeContext, (row) => ({
    assignedReviewerId: typeof row.metadata?.reviewerId === 'string' ? (row.metadata.reviewerId as string) : null,
    workspaceId: typeof row.metadata?.workspaceId === 'string' ? (row.metadata.workspaceId as string) : null,
    sourceGroup: typeof row.metadata?.sourceGroup === 'string' ? (row.metadata.sourceGroup as string) : null
  })).filter((row) => {
    if (entityId && row.entityId !== entityId) return false;
    if (entityType && row.entityType !== entityType) return false;
    return true;
  });

  filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const start = (page - 1) * pageSize;
  const data = filtered.slice(start, start + pageSize);

  return Response.json({
    data,
    meta: {
      page,
      pageSize,
      total: filtered.length
    }
  });
}
