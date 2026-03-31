import { beforeEach, describe, expect, test, vi } from 'vitest';

const requireRoleMock = vi.fn();
const prismaMock = {
  canonicalRecordVersion: { findMany: vi.fn() },
  proposedChangeSet: { findMany: vi.fn() },
  ingestionJob: { findMany: vi.fn() },
  pipelineTelemetry: { findMany: vi.fn() }
};

vi.mock('@/lib/auth-guard', () => ({ requireRole: requireRoleMock }));
vi.mock('@/lib/db', () => ({ prisma: prismaMock }));

describe('audit route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ user: { id: 'u1', role: 'viewer', status: 'ACTIVE' } });
  });

  test('returns unified audit events from all four sources', async () => {
    prismaMock.canonicalRecordVersion.findMany.mockResolvedValueOnce([
      { id: 'v1', eventId: 'evt-1', versionNumber: 2, changeSummary: 'Publish', sourceDocumentId: 'src-1', proposedChangeSetId: null, publishBatchId: 'pb-1', createdByUserId: 'admin-1', createdAt: new Date('2026-01-04T00:00:00.000Z') }
    ]);
    prismaMock.proposedChangeSet.findMany.mockResolvedValueOnce([
      { id: 'cs1', reviewStatus: 'approved', matchedEventId: 'evt-1', sourceDocumentId: 'src-1', reviewedByUserId: 'mod-1', notes: 'Looks good', reviewedAt: new Date('2026-01-03T00:00:00.000Z'), updatedAt: new Date('2026-01-03T00:00:00.000Z') }
    ]);
    prismaMock.ingestionJob.findMany.mockResolvedValueOnce([
      { id: 'ij1', sourceDocumentId: 'src-1', status: 'needs_review', requestedByUserId: 'op-1', errorCode: null, errorMessage: null, createdAt: new Date('2026-01-02T00:00:00.000Z') }
    ]);
    prismaMock.pipelineTelemetry.findMany.mockResolvedValueOnce([
      { id: 'pt1', stage: 'ai_extraction', status: 'success', detail: 'done', entityId: 'evt-1', entityType: 'Event', configVersion: 1, durationMs: 1000, metadata: {}, createdAt: new Date('2026-01-01T00:00:00.000Z') }
    ]);

    const { GET } = await import('@/app/api/admin/audit/route');
    const response = await GET(new Request('http://localhost/api/admin/audit?page=1&pageSize=50'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toHaveLength(4);
    expect(payload.data.map((row: any) => row.eventType)).toEqual(expect.arrayContaining(['published', 'approved', 'intake_started', 'extraction_run']));
  });

  test('maps rollback telemetry stage into rollback_execution event type', async () => {
    prismaMock.canonicalRecordVersion.findMany.mockResolvedValueOnce([]);
    prismaMock.proposedChangeSet.findMany.mockResolvedValueOnce([]);
    prismaMock.ingestionJob.findMany.mockResolvedValueOnce([]);
    prismaMock.pipelineTelemetry.findMany.mockResolvedValueOnce([
      { id: 'pt-rollback', stage: 'rollback', status: 'success', detail: 'rollback complete', entityId: 'evt-1', entityType: 'Event', configVersion: null, durationMs: 200, metadata: {}, createdAt: new Date('2026-01-01T00:00:00.000Z') }
    ]);

    const { GET } = await import('@/app/api/admin/audit/route');
    const response = await GET(new Request('http://localhost/api/admin/audit?page=1&pageSize=50'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data[0].eventType).toBe('rollback_execution');
  });

  test('entityId filter limits results', async () => {
    prismaMock.canonicalRecordVersion.findMany.mockResolvedValueOnce([
      { id: 'v1', eventId: 'evt-1', versionNumber: 1, changeSummary: null, sourceDocumentId: null, proposedChangeSetId: null, publishBatchId: null, createdByUserId: null, createdAt: new Date('2026-01-01T00:00:00.000Z') }
    ]);
    prismaMock.proposedChangeSet.findMany.mockResolvedValueOnce([]);
    prismaMock.ingestionJob.findMany.mockResolvedValueOnce([]);
    prismaMock.pipelineTelemetry.findMany.mockResolvedValueOnce([]);

    const { GET } = await import('@/app/api/admin/audit/route');
    const response = await GET(new Request('http://localhost/api/admin/audit?entityType=Event&entityId=evt-1'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toHaveLength(1);
    expect(payload.data[0].entityId).toBe('evt-1');
  });

  test('results are sorted by createdAt descending and pagination works', async () => {
    prismaMock.canonicalRecordVersion.findMany.mockResolvedValueOnce([
      { id: 'v1', eventId: 'evt-1', versionNumber: 1, changeSummary: null, sourceDocumentId: null, proposedChangeSetId: null, publishBatchId: null, createdByUserId: null, createdAt: new Date('2026-01-04T00:00:00.000Z') }
    ]);
    prismaMock.proposedChangeSet.findMany.mockResolvedValueOnce([
      { id: 'cs1', reviewStatus: 'rejected', matchedEventId: 'evt-1', sourceDocumentId: 'src-1', reviewedByUserId: null, notes: null, reviewedAt: new Date('2026-01-03T00:00:00.000Z'), updatedAt: new Date('2026-01-03T00:00:00.000Z') }
    ]);
    prismaMock.ingestionJob.findMany.mockResolvedValueOnce([
      { id: 'ij1', sourceDocumentId: 'src-1', status: 'failed', requestedByUserId: null, errorCode: 'E1', errorMessage: 'boom', createdAt: new Date('2026-01-02T00:00:00.000Z') }
    ]);
    prismaMock.pipelineTelemetry.findMany.mockResolvedValueOnce([
      { id: 'pt1', stage: 'ai_extraction', status: 'success', detail: null, entityId: 'evt-1', entityType: 'Event', configVersion: null, durationMs: null, metadata: {}, createdAt: new Date('2026-01-01T00:00:00.000Z') }
    ]);

    const { GET } = await import('@/app/api/admin/audit/route');
    const response = await GET(new Request('http://localhost/api/admin/audit?page=1&pageSize=2'));
    const payload = await response.json();

    expect(payload.data).toHaveLength(2);
    expect(new Date(payload.data[0].createdAt).getTime()).toBeGreaterThanOrEqual(new Date(payload.data[1].createdAt).getTime());
    expect(payload.meta).toEqual({ page: 1, pageSize: 2, total: 4 });
  });
});
