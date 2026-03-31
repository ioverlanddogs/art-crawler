import { beforeEach, describe, expect, test, vi } from 'vitest';

const requireRoleMock = vi.fn();

const prismaMock = {
  ingestionJob: { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  extractionRun: { findFirst: vi.fn() },
  proposedChangeSet: { findFirst: vi.fn() }
};

vi.mock('@/lib/auth-guard', () => ({
  requireRole: requireRoleMock
}));

vi.mock('@/lib/db', () => ({
  prisma: prismaMock
}));

describe('intake ui routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ user: { id: 'admin-1', role: 'admin', status: 'ACTIVE' } });
  });

  test('retry route returns 404 for unknown id', async () => {
    const { POST } = await import('@/app/api/admin/intake/[id]/retry/route');
    prismaMock.ingestionJob.findUnique.mockResolvedValueOnce(null);

    const res = await POST(new Request('http://localhost/api/admin/intake/job-404/retry', { method: 'POST' }), { params: { id: 'job-404' } });

    expect(res.status).toBe(404);
  });

  test('retry route returns 400 for non-failed job', async () => {
    const { POST } = await import('@/app/api/admin/intake/[id]/retry/route');
    prismaMock.ingestionJob.findUnique.mockResolvedValueOnce({ id: 'job-1', status: 'queued' });

    const res = await POST(new Request('http://localhost/api/admin/intake/job-1/retry', { method: 'POST' }), { params: { id: 'job-1' } });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual(expect.objectContaining({ code: 'NOT_RETRYABLE' }));
  });

  test('retry route returns 200 for failed job and resets fields', async () => {
    const { POST } = await import('@/app/api/admin/intake/[id]/retry/route');
    prismaMock.ingestionJob.findUnique.mockResolvedValueOnce({ id: 'job-2', status: 'failed' });
    prismaMock.ingestionJob.update.mockResolvedValueOnce({ id: 'job-2', status: 'queued' });

    const res = await POST(new Request('http://localhost/api/admin/intake/job-2/retry', { method: 'POST' }), { params: { id: 'job-2' } });

    expect(res.status).toBe(200);
    expect(prismaMock.ingestionJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-2' },
        data: expect.objectContaining({ status: 'queued', errorCode: null, errorMessage: null, startedAt: expect.any(Date) })
      })
    );
    await expect(res.json()).resolves.toEqual({ queued: true });
  });

  test('intake list route returns paginated results and applies status filter', async () => {
    const { GET } = await import('@/app/api/admin/intake/route');

    prismaMock.ingestionJob.count.mockResolvedValueOnce(1);
    prismaMock.ingestionJob.findMany.mockResolvedValueOnce([{ id: 'job-1', status: 'failed' }]);

    const res = await GET(new Request('http://localhost/api/admin/intake?page=1&pageSize=20&status=failed'));

    expect(res.status).toBe(200);
    expect(prismaMock.ingestionJob.count).toHaveBeenCalledWith({ where: { status: 'failed' } });
    expect(prismaMock.ingestionJob.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'failed' },
        skip: 0,
        take: 20
      })
    );
    await expect(res.json()).resolves.toEqual(
      expect.objectContaining({
        data: expect.any(Array),
        meta: expect.objectContaining({ page: 1, pageSize: 20, total: 1 })
      })
    );
  });

  test('intake detail route returns 404 for unknown id', async () => {
    const { GET } = await import('@/app/api/admin/intake/[id]/route');
    prismaMock.ingestionJob.findUnique.mockResolvedValueOnce(null);

    const res = await GET(new Request('http://localhost/api/admin/intake/job-missing'), { params: { id: 'job-missing' } });

    expect(res.status).toBe(404);
  });

  test('intake detail route returns nested result for known id', async () => {
    const { GET } = await import('@/app/api/admin/intake/[id]/route');
    prismaMock.ingestionJob.findUnique.mockResolvedValueOnce({ id: 'job-3', sourceDocumentId: 'sd-1', sourceDocument: { id: 'sd-1' } });
    prismaMock.extractionRun.findFirst.mockResolvedValueOnce({ id: 'er-1' });
    prismaMock.proposedChangeSet.findFirst.mockResolvedValueOnce({ id: 'pcs-1' });

    const res = await GET(new Request('http://localhost/api/admin/intake/job-3'), { params: { id: 'job-3' } });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(
      expect.objectContaining({
        id: 'job-3',
        extractionRun: { id: 'er-1' },
        proposedChangeSet: { id: 'pcs-1' }
      })
    );
  });
});
