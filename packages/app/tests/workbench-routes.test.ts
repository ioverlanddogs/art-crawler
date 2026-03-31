import { beforeEach, describe, expect, test, vi } from 'vitest';

const requireRoleMock = vi.fn();

const prismaMock = {
  sourceDocument: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  extractionRun: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
  proposedChangeSet: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn()
  },
  fieldReview: {
    create: vi.fn(),
    upsert: vi.fn(),
    findMany: vi.fn()
  },
  ingestionJob: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn()
  },
  publishBatch: { create: vi.fn(), findMany: vi.fn() },
  event: {
    create: vi.fn(),
    update: vi.fn()
  },
  $transaction: vi.fn()
};

vi.mock('@/lib/auth-guard', () => ({
  requireRole: requireRoleMock
}));

vi.mock('@/lib/db', () => ({
  prisma: prismaMock
}));

describe('workbench routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ user: { id: 'op-1', role: 'operator', status: 'ACTIVE' } });
    prismaMock.$transaction.mockImplementation(async (arg: any) => (typeof arg === 'function' ? arg(prismaMock) : Promise.all(arg)));
  });

  test('GET /fields returns 404 for unknown id', async () => {
    const { GET } = await import('@/app/api/admin/workbench/[changeSetId]/fields/route');
    prismaMock.proposedChangeSet.findUnique.mockResolvedValueOnce(null);

    const response = await GET(new Request('http://localhost'), { params: { changeSetId: 'missing' } });

    expect(response.status).toBe(404);
  });

  test('GET /fields returns 200 with diff', async () => {
    const { GET } = await import('@/app/api/admin/workbench/[changeSetId]/fields/route');
    prismaMock.proposedChangeSet.findUnique.mockResolvedValueOnce({
      id: 'pcs-1',
      proposedDataJson: { title: 'Proposed title' },
      fieldReviews: [],
      sourceDocument: {},
      extractionRun: null,
      matchedEvent: null
    });

    const response = await GET(new Request('http://localhost'), { params: { changeSetId: 'pcs-1' } });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.diffResult).toBeDefined();
    expect(payload.diffResult.fields[0].state).toBe('added');
  });

  test('PATCH /fields/[fieldPath] returns 403 for viewer and 200 for operator with upsert', async () => {
    const { PATCH } = await import('@/app/api/admin/workbench/[changeSetId]/fields/[fieldPath]/route');

    requireRoleMock.mockRejectedValueOnce(new Response('Forbidden', { status: 403 }));
    let response = await PATCH(new Request('http://localhost', { method: 'PATCH', body: '{}' }), {
      params: { changeSetId: 'pcs-1', fieldPath: 'title' }
    });
    expect(response.status).toBe(403);

    requireRoleMock.mockResolvedValueOnce({ user: { id: 'op-1', role: 'operator', status: 'ACTIVE' } });
    prismaMock.proposedChangeSet.findUnique.mockResolvedValueOnce({ id: 'pcs-1', proposedDataJson: { title: 'Original' } });
    prismaMock.fieldReview.upsert.mockResolvedValueOnce({ id: 'fr-1', fieldPath: 'title', decision: 'accepted' });

    response = await PATCH(
      new Request('http://localhost', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision: 'accepted' })
      }),
      {
        params: { changeSetId: 'pcs-1', fieldPath: 'title' }
      }
    );

    expect(response.status).toBe(200);
    expect(prismaMock.fieldReview.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          proposedChangeSetId_fieldPath: {
            proposedChangeSetId: 'pcs-1',
            fieldPath: 'title'
          }
        }
      })
    );
  });

  test('POST /approve returns 409 when publish gate fails', async () => {
    const { POST } = await import('@/app/api/admin/workbench/[changeSetId]/approve/route');
    prismaMock.proposedChangeSet.findUnique.mockResolvedValueOnce({
      id: 'pcs-1',
      sourceDocumentId: 'sd-1',
      sourceDocument: { sourceUrl: 'https://example.test' },
      proposedDataJson: { startAt: '2026-04-01T19:00:00Z' },
      fieldReviews: [{ fieldPath: 'startAt', decision: 'accepted', confidence: 0.9 }],
      matchedEventId: null
    });

    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mergeStrategy: 'create_new' })
      }),
      { params: { changeSetId: 'pcs-1' } }
    );

    expect(response.status).toBe(409);
  });

  test('POST /approve returns 200 and creates event when gate passes', async () => {
    const { POST } = await import('@/app/api/admin/workbench/[changeSetId]/approve/route');
    prismaMock.proposedChangeSet.findUnique.mockResolvedValueOnce({
      id: 'pcs-1',
      sourceDocumentId: 'sd-1',
      sourceDocument: { sourceUrl: 'https://example.test' },
      proposedDataJson: { title: 'Show', startAt: '2026-04-01T19:00:00Z' },
      fieldReviews: [
        { fieldPath: 'title', decision: 'accepted', confidence: 0.8, proposedValueJson: 'Show' },
        { fieldPath: 'startAt', decision: 'accepted', confidence: 0.8, proposedValueJson: '2026-04-01T19:00:00Z' }
      ],
      matchedEventId: null
    });
    prismaMock.event.create.mockResolvedValueOnce({ id: 'evt-1' });
    prismaMock.proposedChangeSet.update.mockResolvedValueOnce({ id: 'pcs-1' });
    prismaMock.ingestionJob.findFirst.mockResolvedValueOnce({ id: 'job-1' });
    prismaMock.ingestionJob.update.mockResolvedValueOnce({ id: 'job-1' });

    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mergeStrategy: 'create_new' })
      }),
      { params: { changeSetId: 'pcs-1' } }
    );

    expect(response.status).toBe(200);
    expect(prismaMock.event.create).toHaveBeenCalled();
    expect(prismaMock.ingestionJob.findFirst).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { createdAt: 'desc' } }));
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ eventId: 'evt-1', created: true }));
  });


  test('POST /fields auto-approves safe fields', async () => {
    const { POST } = await import('@/app/api/admin/workbench/[changeSetId]/fields/route');
    prismaMock.proposedChangeSet.findUnique.mockResolvedValueOnce({
      id: 'pcs-1',
      proposedDataJson: { title: 'Show', startAt: '2026-04-01T19:00:00Z' },
      fieldReviews: [],
      matchedEvent: null
    });
    prismaMock.fieldReview.upsert.mockResolvedValue({ id: 'fr-1' });

    const response = await POST(new Request('http://localhost', { method: 'POST' }), { params: { changeSetId: 'pcs-1' } });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ updated: 2 }));
  });

  test('POST /fields returns skipped reasons for non-safe fields', async () => {
    const { POST } = await import('@/app/api/admin/workbench/[changeSetId]/fields/route');
    prismaMock.proposedChangeSet.findUnique.mockResolvedValueOnce({
      id: 'pcs-1',
      proposedDataJson: { title: 'Show', timezone: 'UTC', description: 'note' },
      fieldReviews: [
        { fieldPath: 'title', decision: null, confidence: 0.8 },
        { fieldPath: 'timezone', decision: 'rejected', confidence: 0.9 },
        { fieldPath: 'description', decision: null, confidence: 0.4 }
      ],
      matchedEvent: null
    });
    prismaMock.fieldReview.upsert.mockResolvedValue({ id: 'fr-1' });

    const response = await POST(new Request('http://localhost', { method: 'POST' }), { params: { changeSetId: 'pcs-1' } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.updated).toBe(1);
    expect(payload.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldPath: 'timezone', reason: 'already_rejected' }),
        expect.objectContaining({ fieldPath: 'description', reason: 'low_confidence' })
      ])
    );
  });

  test('POST /reparse queues ingestion job', async () => {
    const { POST } = await import('@/app/api/admin/workbench/[changeSetId]/reparse/route');
    prismaMock.proposedChangeSet.findUnique.mockResolvedValueOnce({ id: 'pcs-1', sourceDocumentId: 'sd-1', notes: 'prior note' });
    prismaMock.ingestionJob.findFirst.mockResolvedValueOnce({ id: 'job-1' });

    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ note: 'retry with extra context' })
      }),
      { params: { changeSetId: 'pcs-1' } }
    );

    expect(response.status).toBe(200);
    expect(prismaMock.ingestionJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'queued', startedAt: null }) })
    );
    expect(prismaMock.proposedChangeSet.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ notes: expect.stringContaining('retry with extra context') }) })
    );
  });
  test('POST /reject returns 200 and marks changeset rejected', async () => {
    const { POST } = await import('@/app/api/admin/workbench/[changeSetId]/reject/route');
    prismaMock.proposedChangeSet.findUnique.mockResolvedValueOnce({ id: 'pcs-1', sourceDocumentId: 'sd-1' });
    prismaMock.proposedChangeSet.update.mockResolvedValueOnce({ id: 'pcs-1' });
    prismaMock.ingestionJob.findFirst.mockResolvedValueOnce({ id: 'job-1' });
    prismaMock.ingestionJob.update.mockResolvedValueOnce({ id: 'job-1' });

    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'bad source quality' })
      }),
      { params: { changeSetId: 'pcs-1' } }
    );

    expect(response.status).toBe(200);
    expect(prismaMock.proposedChangeSet.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reviewStatus: 'rejected' }) })
    );
  });
});
