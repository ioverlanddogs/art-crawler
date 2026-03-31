import { beforeEach, describe, expect, test, vi } from 'vitest';

const requireRoleMock = vi.fn();
const checkPublishReadinessMock = vi.fn();

const prismaMock = {
  sourceDocument: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  extractionRun: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
  event: {
    count: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn()
  },
  proposedChangeSet: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn()
  },
  publishBatch: {
    create: vi.fn(),
    findMany: vi.fn()
  },
  canonicalRecordVersion: {
    findFirst: vi.fn(),
    create: vi.fn()
  },
  fieldReview: { create: vi.fn(), upsert: vi.fn(), findMany: vi.fn() },
  ingestionJob: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn()
  },
  $transaction: vi.fn()
};

vi.mock('@/lib/auth-guard', () => ({
  requireRole: requireRoleMock
}));

vi.mock('@/lib/db', () => ({
  prisma: prismaMock
}));

vi.mock('@/lib/intake/publish-gate', () => ({
  checkPublishReadiness: checkPublishReadinessMock
}));

describe('publish routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    requireRoleMock.mockResolvedValue({ user: { id: 'op-1', role: 'operator', status: 'ACTIVE' } });
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(prismaMock));
    checkPublishReadinessMock.mockReturnValue({ ready: true, blockers: [], warnings: [] });
  });

  test('GET /api/admin/publish returns ready events with pagination', async () => {
    prismaMock.event.count.mockResolvedValueOnce(1);
    prismaMock.event.findMany.mockResolvedValueOnce([
      {
        id: 'evt-1',
        title: 'Ready Event',
        publishStatus: 'ready',
        proposedChangeSets: [{ id: 'pcs-1', reviewedByUserId: 'mod-1', reviewedAt: new Date('2026-01-01T00:00:00.000Z'), sourceDocumentId: 'sd-1' }]
      }
    ]);

    const { GET } = await import('@/app/api/admin/publish/route');
    const response = await GET(new Request('http://localhost/api/admin/publish?page=2&pageSize=1'));

    expect(response.status).toBe(200);
    expect(prismaMock.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { publishStatus: 'ready' },
        skip: 1,
        take: 1
      })
    );

    const payload = await response.json();
    expect(payload.meta).toEqual({ page: 2, pageSize: 1, total: 1 });
    expect(payload.data).toHaveLength(1);
    expect(payload.data[0].latestProposedChangeSet).toBeDefined();
  });

  test('POST /api/admin/publish/[eventId] returns 404 for unknown event', async () => {
    prismaMock.event.findUnique.mockResolvedValueOnce(null);

    const { POST } = await import('@/app/api/admin/publish/[eventId]/route');
    const response = await POST(new Request('http://localhost/api/admin/publish/evt-missing', { method: 'POST', body: '{}' }), {
      params: { eventId: 'evt-missing' }
    });

    expect(response.status).toBe(404);
  });

  test('POST /api/admin/publish/[eventId] returns 400 for non-ready event', async () => {
    prismaMock.event.findUnique.mockResolvedValueOnce({ id: 'evt-1', publishStatus: 'draft' });

    const { POST } = await import('@/app/api/admin/publish/[eventId]/route');
    const response = await POST(new Request('http://localhost/api/admin/publish/evt-1', { method: 'POST', body: '{}' }), {
      params: { eventId: 'evt-1' }
    });

    expect(response.status).toBe(400);
  });

  test('POST /api/admin/publish/[eventId] returns 409 when publish gate fails', async () => {
    prismaMock.event.findUnique.mockResolvedValueOnce({ id: 'evt-1', publishStatus: 'ready' });
    prismaMock.proposedChangeSet.findFirst.mockResolvedValueOnce({
      id: 'pcs-1',
      sourceDocumentId: 'sd-1',
      proposedDataJson: { title: 'Show' },
      fieldReviews: []
    });
    checkPublishReadinessMock.mockReturnValueOnce({ ready: false, blockers: ['missing title'], warnings: ['low confidence'] });

    const { POST } = await import('@/app/api/admin/publish/[eventId]/route');
    const response = await POST(new Request('http://localhost/api/admin/publish/evt-1', { method: 'POST', body: '{}' }), {
      params: { eventId: 'evt-1' }
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ blockers: ['missing title'], warnings: ['low confidence'], blockerReasons: expect.any(Array) })
    );
  });

  test('POST /api/admin/publish/[eventId] returns structured duplicate blocker reasons', async () => {
    prismaMock.event.findUnique.mockResolvedValueOnce({ id: 'evt-1', publishStatus: 'ready' });
    prismaMock.proposedChangeSet.findFirst.mockResolvedValueOnce({
      id: 'pcs-dup',
      sourceDocumentId: 'sd-dup',
      proposedDataJson: { title: 'Show' },
      fieldReviews: [],
      duplicateCandidates: [{ id: 'dup-1', resolutionStatus: 'unresolved' }]
    });
    checkPublishReadinessMock.mockReturnValueOnce({
      ready: false,
      blockers: ['1 unresolved duplicate candidate(s) require an explicit resolution.'],
      warnings: []
    });

    const { POST } = await import('@/app/api/admin/publish/[eventId]/route');
    const response = await POST(new Request('http://localhost/api/admin/publish/evt-1', { method: 'POST', body: '{}' }), {
      params: { eventId: 'evt-1' }
    });
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.blockerReasons).toContain('duplicate_blocker');
  });

  test('POST /api/admin/publish/[eventId] returns 200, creates batch, and updates statuses', async () => {
    prismaMock.event.findUnique.mockResolvedValueOnce({ id: 'evt-1', publishStatus: 'ready' });
    prismaMock.proposedChangeSet.findFirst.mockResolvedValueOnce({
      id: 'pcs-1',
      sourceDocumentId: 'sd-1',
      proposedDataJson: { title: 'Show', startAt: '2026-04-01T19:00:00Z' },
      fieldReviews: []
    });
    prismaMock.publishBatch.create.mockResolvedValueOnce({ id: 'pb-1' });
    prismaMock.event.update.mockResolvedValueOnce({ id: 'evt-1' });
    prismaMock.canonicalRecordVersion.findFirst.mockResolvedValueOnce(null);
    prismaMock.canonicalRecordVersion.create.mockResolvedValueOnce({ id: 'v-1' });
    prismaMock.ingestionJob.updateMany.mockResolvedValueOnce({ count: 1 });

    const { POST } = await import('@/app/api/admin/publish/[eventId]/route');
    const response = await POST(
      new Request('http://localhost/api/admin/publish/evt-1', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ releaseSummary: 'Weekly rollout' })
      }),
      {
        params: { eventId: 'evt-1' }
      }
    );

    expect(response.status).toBe(200);
    expect(prismaMock.publishBatch.create).toHaveBeenCalled();
    expect(prismaMock.event.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ publishStatus: 'published' }) })
    );
    expect(prismaMock.ingestionJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sourceDocumentId: 'sd-1' }, data: { status: 'published' } })
    );
    await expect(response.json()).resolves.toEqual({ publishBatchId: 'pb-1', eventId: 'evt-1' });
  });
});
