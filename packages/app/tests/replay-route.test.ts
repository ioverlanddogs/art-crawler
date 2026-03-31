import { beforeEach, describe, expect, test, vi } from 'vitest';

const requireRoleMock = vi.fn();

const prismaMock = {
  pipelineTelemetry: {
    findMany: vi.fn(),
    create: vi.fn()
  }
};

vi.mock('@/lib/auth-guard', () => ({ requireRole: requireRoleMock }));
vi.mock('@/lib/db', () => ({ prisma: prismaMock }));

describe('replay route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('GET returns failed jobs for recovery search', async () => {
    requireRoleMock.mockResolvedValueOnce({ user: { role: 'viewer', status: 'ACTIVE' } });
    prismaMock.pipelineTelemetry.findMany.mockResolvedValueOnce([{ id: 't1', stage: 'extract', status: 'failure' }]);

    const { GET } = await import('@/app/api/admin/recovery/replay/route');
    const res = await GET(new Request('http://localhost/api/admin/recovery/replay?q=extract&limit=10'));

    expect(res.status).toBe(200);
    expect(prismaMock.pipelineTelemetry.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'failure' }) }));
    await expect(res.json()).resolves.toEqual({ data: [{ id: 't1', stage: 'extract', status: 'failure' }] });
  });

  test('POST records explicit replay event and keeps canonical write disabled', async () => {
    requireRoleMock.mockResolvedValueOnce({ user: { id: 'op-1', email: 'op@example.test', role: 'operator', status: 'ACTIVE' } });
    prismaMock.pipelineTelemetry.create.mockResolvedValueOnce({ id: 'audit-1' });

    const { POST } = await import('@/app/api/admin/recovery/replay/route');
    const res = await POST(
      new Request('http://localhost/api/admin/recovery/replay', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'replay_ingestion_chain',
          targetType: 'ingestion_job',
          targetId: 'job-1',
          reason: 'recover failed job chain',
          dryRun: true
        })
      })
    );

    expect(res.status).toBe(200);
    expect(prismaMock.pipelineTelemetry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stage: 'replay_ingestion_chain', status: 'dry_run' }) })
    );

    const payload = await res.json();
    expect(payload.canonicalWriteAllowed).toBe(false);
  });
});
