import { beforeEach, describe, expect, test, vi } from 'vitest';

const requireRoleMock = vi.fn();
const prismaMock = {
  duplicateCandidate: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn()
  },
  proposedChangeSet: {
    findUnique: vi.fn(),
    update: vi.fn()
  },
  pipelineTelemetry: {
    create: vi.fn()
  },
  $transaction: vi.fn()
};

vi.mock('@/lib/auth-guard', () => ({ requireRole: requireRoleMock }));
vi.mock('@/lib/db', () => ({ prisma: prismaMock }));

describe('duplicate routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ user: { id: 'mod-1', role: 'moderator', status: 'ACTIVE' } });
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(prismaMock));
  });

  test('GET /api/admin/duplicates returns unresolved queue', async () => {
    prismaMock.duplicateCandidate.findMany.mockResolvedValueOnce([{ id: 'dup-1' }]);

    const { GET } = await import('@/app/api/admin/duplicates/route');
    const response = await GET(new Request('http://localhost/api/admin/duplicates?filter=publish-blocked'));

    expect(response.status).toBe(200);
    expect(prismaMock.duplicateCandidate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ resolutionStatus: 'unresolved' }) })
    );
  });

  test('PATCH /api/admin/duplicates/[candidateId] handles false positive and audit continuity', async () => {
    prismaMock.duplicateCandidate.update.mockResolvedValueOnce({
      id: 'dup-1',
      proposedChangeSetId: 'pcs-1',
      canonicalEventId: 'evt-1'
    });

    const { PATCH } = await import('@/app/api/admin/duplicates/[candidateId]/route');
    const response = await PATCH(
      new Request('http://localhost/api/admin/duplicates/dup-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resolutionStatus: 'false_positive', reviewerNote: 'Confirmed unrelated events.' })
      }),
      { params: { candidateId: 'dup-1' } }
    );

    expect(response.status).toBe(200);
    expect(prismaMock.pipelineTelemetry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stage: 'duplicate_false_positive' }) })
    );
  });

  test('PATCH /api/admin/duplicates/[candidateId] supports separate-record resolution', async () => {
    prismaMock.duplicateCandidate.update.mockResolvedValueOnce({
      id: 'dup-2',
      proposedChangeSetId: 'pcs-2',
      canonicalEventId: 'evt-2'
    });

    const { PATCH } = await import('@/app/api/admin/duplicates/[candidateId]/route');
    const response = await PATCH(
      new Request('http://localhost/api/admin/duplicates/dup-2', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resolutionStatus: 'resolved_separate', strategy: 'create separate record' })
      }),
      { params: { candidateId: 'dup-2' } }
    );

    expect(response.status).toBe(200);
    expect(prismaMock.pipelineTelemetry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stage: 'duplicate_resolved_separate' }) })
    );
  });
});
