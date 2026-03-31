import { beforeEach, describe, expect, test, vi } from 'vitest';

const requireRoleMock = vi.fn();
const runIntakeMock = vi.fn();

const prismaMock = {
  ingestionJob: { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
  sourceDocument: { create: vi.fn(), update: vi.fn() },
  extractionRun: { create: vi.fn(), findFirst: vi.fn() },
  proposedChangeSet: { create: vi.fn(), findFirst: vi.fn() }
};

vi.mock('@/lib/auth-guard', () => ({
  requireRole: requireRoleMock
}));

vi.mock('@/lib/db', () => ({
  prisma: prismaMock
}));

vi.mock('@/lib/intake/intake-service', () => ({
  runIntake: runIntakeMock
}));

describe('POST /api/admin/intake', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runIntakeMock.mockResolvedValue({
      sourceDocumentId: 'sd-1',
      ingestionJobId: 'job-1',
      proposedChangeSetId: 'pcs-1',
      finalStatus: 'needs_review'
    });
  });

  test('returns 401 when unauthenticated', async () => {
    const { POST } = await import('@/app/api/admin/intake/route');

    requireRoleMock.mockRejectedValueOnce(new Response('Unauthorized', { status: 401 }));

    const res = await POST(new Request('http://localhost/api/admin/intake', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(401);
  });

  test('returns 403 for viewer and moderator roles', async () => {
    const { POST } = await import('@/app/api/admin/intake/route');

    requireRoleMock.mockRejectedValueOnce(new Response('Forbidden', { status: 403 }));
    let res = await POST(new Request('http://localhost/api/admin/intake', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(403);

    requireRoleMock.mockRejectedValueOnce(new Response('Forbidden', { status: 403 }));
    res = await POST(new Request('http://localhost/api/admin/intake', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(403);
  });

  test('returns 400 for missing or malformed URL', async () => {
    const { POST } = await import('@/app/api/admin/intake/route');
    requireRoleMock.mockResolvedValue({ user: { id: 'op-1', role: 'operator', status: 'ACTIVE' } });

    let res = await POST(
      new Request('http://localhost/api/admin/intake', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({})
      })
    );
    expect(res.status).toBe(400);

    res = await POST(
      new Request('http://localhost/api/admin/intake', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceUrl: 'not-a-url' })
      })
    );
    expect(res.status).toBe(400);
  });

  test('returns 201 and result shape for valid operator submission', async () => {
    const { POST } = await import('@/app/api/admin/intake/route');

    requireRoleMock.mockResolvedValueOnce({ user: { id: 'op-1', role: 'operator', status: 'ACTIVE' } });

    const res = await POST(
      new Request('http://localhost/api/admin/intake', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceUrl: 'https://example.com/event' })
      })
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toEqual(
      expect.objectContaining({
        sourceDocumentId: expect.any(String),
        ingestionJobId: expect.any(String),
        finalStatus: expect.any(String)
      })
    );
    expect(runIntakeMock).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ sourceUrl: 'https://example.com/event' }),
      'op-1'
    );
  });
});
