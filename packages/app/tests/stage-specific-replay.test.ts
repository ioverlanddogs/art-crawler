import { beforeEach, describe, expect, test, vi } from 'vitest';

const requireRoleMock = vi.fn();
const prismaMock = { pipelineTelemetry: { create: vi.fn(), findMany: vi.fn() } };

vi.mock('@/lib/auth-guard', () => ({ requireRole: requireRoleMock }));
vi.mock('@/lib/db', () => ({ prisma: prismaMock }));

describe('stage specific replay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ user: { id: 'op-2', role: 'operator', status: 'ACTIVE' } });
  });

  test('rejects replay_from_stage when fromStage is missing', async () => {
    const { POST } = await import('@/app/api/admin/recovery/replay/route');

    await expect(
      POST(
        new Request('http://localhost/api/admin/recovery/replay', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'replay_from_stage',
            targetType: 'ingestion_job',
            targetId: 'job-2',
            reason: 'replay from failed stage',
            dryRun: true
          })
        })
      )
    ).rejects.toThrow('fromStage is required for replay_from_stage');
  });

  test('accepts replay_from_stage with explicit stage', async () => {
    prismaMock.pipelineTelemetry.create.mockResolvedValueOnce({ id: 'audit-stage-1' });
    const { POST } = await import('@/app/api/admin/recovery/replay/route');

    const res = await POST(
      new Request('http://localhost/api/admin/recovery/replay', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'replay_from_stage',
          targetType: 'ingestion_job',
          targetId: 'job-2',
          reason: 'replay from failed stage',
          dryRun: true,
          fromStage: 'extract'
        })
      })
    );

    expect(res.status).toBe(200);
    expect(prismaMock.pipelineTelemetry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stage: 'replay_stage_selected', metadata: expect.objectContaining({ fromStage: 'extract' }) })
      })
    );
  });
});
