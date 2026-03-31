import { beforeEach, describe, expect, test, vi } from 'vitest';

const requireRoleMock = vi.fn();
const prismaMock = {
  duplicateCandidate: { updateMany: vi.fn() },
  pipelineTelemetry: { create: vi.fn() }
};

vi.mock('@/lib/auth-guard', () => ({ requireRole: requireRoleMock }));
vi.mock('@/lib/db', () => ({ prisma: prismaMock }));

describe('batch duplicate actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ user: { id: 'mod-2', role: 'moderator', status: 'ACTIVE' } });
    prismaMock.duplicateCandidate.updateMany.mockResolvedValue({ count: 2 });
  });

  test('POST updates duplicate candidates in bulk', async () => {
    const { POST } = await import('@/app/api/admin/duplicates/batch/route');

    const response = await POST(
      new Request('http://localhost/api/admin/duplicates/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          candidateIds: ['dup-1', 'dup-2'],
          resolutionStatus: 'false_positive',
          reviewerNote: 'Batch clear from hotspot analysis'
        })
      })
    );

    expect(response.status).toBe(200);
    expect(prismaMock.duplicateCandidate.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['dup-1', 'dup-2'] } }, data: expect.objectContaining({ resolutionStatus: 'false_positive' }) })
    );
    expect(prismaMock.pipelineTelemetry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stage: 'duplicate_batch_resolution' }) })
    );
  });
});
