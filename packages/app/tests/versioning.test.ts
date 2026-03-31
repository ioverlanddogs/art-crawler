import { beforeEach, describe, expect, test, vi } from 'vitest';

const requireRoleMock = vi.fn();
const checkPublishReadinessMock = vi.fn();

const prismaMock = {
  event: { findUnique: vi.fn(), update: vi.fn() },
  proposedChangeSet: { findFirst: vi.fn() },
  publishBatch: { create: vi.fn() },
  ingestionJob: { updateMany: vi.fn() },
  canonicalRecordVersion: { findFirst: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
  pipelineTelemetry: { create: vi.fn() },
  $transaction: vi.fn()
};

vi.mock('@/lib/auth-guard', () => ({ requireRole: requireRoleMock }));
vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/intake/publish-gate', () => ({ checkPublishReadiness: checkPublishReadinessMock }));

describe('versioning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ user: { id: 'admin-1', role: 'admin', status: 'ACTIVE' } });
    checkPublishReadinessMock.mockReturnValue({ ready: true, blockers: [], warnings: [] });
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(prismaMock));
  });

  test('publishing an event creates version 1', async () => {
    prismaMock.event.findUnique.mockResolvedValueOnce({ id: 'evt-1', publishStatus: 'ready' });
    prismaMock.proposedChangeSet.findFirst.mockResolvedValueOnce({ id: 'pcs-1', sourceDocumentId: 'src-1', proposedDataJson: {}, fieldReviews: [] });
    prismaMock.publishBatch.create.mockResolvedValueOnce({ id: 'pb-1' });
    prismaMock.event.update.mockResolvedValueOnce({
      id: 'evt-1',
      title: 'Show A',
      startAt: new Date('2026-01-01T10:00:00.000Z'),
      endAt: null,
      timezone: 'UTC',
      location: 'Gallery',
      description: 'Desc',
      sourceUrl: 'https://example.test',
      publishStatus: 'published',
      publishedAt: new Date('2026-01-01T12:00:00.000Z')
    });
    prismaMock.canonicalRecordVersion.findFirst.mockResolvedValueOnce(null);
    prismaMock.canonicalRecordVersion.create.mockResolvedValueOnce({ id: 'ver-1', versionNumber: 1 });
    prismaMock.ingestionJob.updateMany.mockResolvedValueOnce({ count: 1 });

    const { POST } = await import('@/app/api/admin/publish/[eventId]/route');
    const response = await POST(new Request('http://localhost', { method: 'POST', body: '{}' }), { params: { eventId: 'evt-1' } });

    expect(response.status).toBe(200);
    expect(prismaMock.canonicalRecordVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ versionNumber: 1 }) })
    );
  });

  test('publishing same event again creates version 2', async () => {
    prismaMock.event.findUnique.mockResolvedValueOnce({ id: 'evt-1', publishStatus: 'ready' });
    prismaMock.proposedChangeSet.findFirst.mockResolvedValueOnce({ id: 'pcs-1', sourceDocumentId: 'src-1', proposedDataJson: {}, fieldReviews: [] });
    prismaMock.publishBatch.create.mockResolvedValueOnce({ id: 'pb-1' });
    prismaMock.event.update.mockResolvedValueOnce({
      id: 'evt-1',
      title: 'Show B',
      startAt: new Date('2026-01-01T10:00:00.000Z'),
      endAt: null,
      timezone: 'UTC',
      location: 'Gallery',
      description: 'Desc',
      sourceUrl: 'https://example.test',
      publishStatus: 'published',
      publishedAt: new Date('2026-01-01T12:00:00.000Z')
    });
    prismaMock.canonicalRecordVersion.findFirst.mockResolvedValueOnce({ versionNumber: 1 });
    prismaMock.canonicalRecordVersion.create.mockResolvedValueOnce({ id: 'ver-2', versionNumber: 2 });
    prismaMock.ingestionJob.updateMany.mockResolvedValueOnce({ count: 1 });

    const { POST } = await import('@/app/api/admin/publish/[eventId]/route');
    const response = await POST(new Request('http://localhost', { method: 'POST', body: '{}' }), { params: { eventId: 'evt-1' } });

    expect(response.status).toBe(200);
    expect(prismaMock.canonicalRecordVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ versionNumber: 2 }) })
    );
  });

  test('rollback applies historical data and creates a new version entry', async () => {
    prismaMock.event.findUnique.mockResolvedValueOnce({ id: 'evt-1', title: 'Current', startAt: new Date(), endAt: null });
    prismaMock.canonicalRecordVersion.findUnique.mockResolvedValueOnce({
      id: 'ver-1',
      eventId: 'evt-1',
      versionNumber: 1,
      dataJson: {
        title: 'Historic',
        startAt: '2026-02-01T10:00:00.000Z',
        endAt: null,
        timezone: 'UTC',
        location: 'Old Location',
        description: 'Old Description',
        sourceUrl: 'https://old.example.test',
        publishedAt: '2026-02-01T12:00:00.000Z'
      }
    });
    prismaMock.canonicalRecordVersion.findFirst.mockResolvedValueOnce({ versionNumber: 2 });
    prismaMock.event.update.mockResolvedValueOnce({
      id: 'evt-1',
      title: 'Historic',
      startAt: new Date('2026-02-01T10:00:00.000Z'),
      endAt: null,
      timezone: 'UTC',
      location: 'Old Location',
      description: 'Old Description',
      sourceUrl: 'https://old.example.test',
      publishStatus: 'rolled_back',
      publishedAt: new Date('2026-02-01T12:00:00.000Z')
    });
    prismaMock.canonicalRecordVersion.create.mockResolvedValueOnce({ id: 'ver-3', versionNumber: 3 });
    prismaMock.pipelineTelemetry.create.mockResolvedValueOnce({ id: 'tel-1' });

    const { POST } = await import('@/app/api/admin/publish/[eventId]/rollback/route');
    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ versionNumber: 1, reason: 'Bad merge' })
      }),
      { params: { eventId: 'evt-1' } }
    );

    expect(response.status).toBe(200);
    expect(prismaMock.event.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ title: 'Historic', publishStatus: 'rolled_back' }) }));
    expect(prismaMock.canonicalRecordVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ versionNumber: 3, changeSummary: 'Rollback to v1: Bad merge' }) })
    );
  });

  test('rollback to current version returns 400', async () => {
    prismaMock.event.findUnique.mockResolvedValueOnce({ id: 'evt-1' });
    prismaMock.canonicalRecordVersion.findUnique.mockResolvedValueOnce({ id: 'ver-2', versionNumber: 2, dataJson: {} });
    prismaMock.canonicalRecordVersion.findFirst.mockResolvedValueOnce({ versionNumber: 2 });

    const { POST } = await import('@/app/api/admin/publish/[eventId]/rollback/route');
    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ versionNumber: 2, reason: 'No-op' })
      }),
      { params: { eventId: 'evt-1' } }
    );

    expect(response.status).toBe(400);
  });
});
