import { beforeEach, describe, expect, test, vi } from 'vitest';

const requireRoleMock = vi.fn();

const prismaMock = {
  pipelineConfigVersion: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn()
  },
  modelVersion: {
    updateMany: vi.fn(),
    update: vi.fn()
  },
  ingestExtractedEvent: {
    count: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn()
  },
  adminUser: {
    upsert: vi.fn()
  },
  adminInvite: {
    create: vi.fn()
  },
  pipelineTelemetry: {
    findMany: vi.fn(),
    create: vi.fn()
  },
  siteSetting: {
    upsert: vi.fn()
  },
  $transaction: vi.fn()
};

vi.mock('@/lib/auth-guard', () => ({
  requireRole: requireRoleMock
}));

vi.mock('@/lib/db', () => ({
  prisma: prismaMock
}));

describe('admin api authz regressions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
  });

  test('config activate enforces 401/403 and allows operator+', async () => {
    const { POST } = await import('@/app/api/admin/config/activate/route');

    requireRoleMock.mockRejectedValueOnce(new Response('Unauthorized', { status: 401 }));
    let res = await POST(new Request('http://localhost', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(401);

    requireRoleMock.mockRejectedValueOnce(new Response('Forbidden', { status: 403 }));
    res = await POST(new Request('http://localhost', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(403);

    requireRoleMock.mockResolvedValueOnce({ user: { id: 'u1', email: 'ops@example.test', role: 'operator', status: 'ACTIVE' } });
    prismaMock.pipelineConfigVersion.findUnique.mockResolvedValueOnce({ id: 'cfg-1', region: 'us', version: 1 });
    prismaMock.pipelineConfigVersion.updateMany.mockResolvedValueOnce({ count: 0 });
    prismaMock.pipelineConfigVersion.update.mockResolvedValueOnce({ id: 'cfg-1', version: 1, status: 'ACTIVE' });
    prismaMock.pipelineTelemetry.create.mockResolvedValueOnce({ id: 't1' });

    res = await POST(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'cfg-1', reason: 'activate config safely', confirmText: 'ACTIVATE' })
      })
    );
    expect(res.status).toBe(200);
  });

  test('model promote enforces 401/403 and allows operator+', async () => {
    const { POST } = await import('@/app/api/admin/models/[id]/promote/route');

    requireRoleMock.mockRejectedValueOnce(new Response('Unauthorized', { status: 401 }));
    let res = await POST(new Request('http://localhost', { method: 'POST', body: '{}' }), { params: { id: 'm1' } });
    expect(res.status).toBe(401);

    requireRoleMock.mockRejectedValueOnce(new Response('Forbidden', { status: 403 }));
    res = await POST(new Request('http://localhost', { method: 'POST', body: '{}' }), { params: { id: 'm1' } });
    expect(res.status).toBe(403);

    requireRoleMock.mockResolvedValueOnce({ user: { id: 'u1', email: 'ops@example.test', role: 'operator', status: 'ACTIVE' } });
    prismaMock.pipelineConfigVersion.findFirst.mockResolvedValueOnce({ version: 7 });
    prismaMock.modelVersion.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.modelVersion.update.mockResolvedValueOnce({ id: 'm1', name: 'lr', version: 2, status: 'ACTIVE' });
    prismaMock.pipelineTelemetry.create.mockResolvedValueOnce({ id: 't2' });

    res = await POST(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'promote after validation', confirmText: 'PROMOTE' })
      }),
      { params: { id: 'm1' } }
    );

    expect(res.status).toBe(200);
  });

  test('moderation events list and detail enforce 401/403 and allow viewer+', async () => {
    const { GET: listGET } = await import('@/app/api/admin/moderation/events/route');
    const { GET: detailGET } = await import('@/app/api/admin/moderation/events/[id]/route');

    requireRoleMock.mockRejectedValueOnce(new Response('Unauthorized', { status: 401 }));
    let res = await listGET(new Request('http://localhost/api/admin/moderation/events'));
    expect(res.status).toBe(401);

    requireRoleMock.mockRejectedValueOnce(new Response('Forbidden', { status: 403 }));
    res = await detailGET(new Request('http://localhost'), { params: { id: 'evt-1' } });
    expect(res.status).toBe(403);

    requireRoleMock.mockResolvedValueOnce({ user: { role: 'viewer', status: 'ACTIVE' } });
    prismaMock.ingestExtractedEvent.count.mockResolvedValueOnce(1);
    prismaMock.ingestExtractedEvent.findMany.mockResolvedValueOnce([{ id: 'evt-1' }]);

    res = await listGET(new Request('http://localhost/api/admin/moderation/events?page=1&pageSize=10'));
    expect(res.status).toBe(200);

    requireRoleMock.mockResolvedValueOnce({ user: { role: 'viewer', status: 'ACTIVE' } });
    prismaMock.ingestExtractedEvent.findUnique.mockResolvedValueOnce({ id: 'evt-1', clusterKey: null, venue: null, ingestRun: null });
    prismaMock.pipelineTelemetry.findMany.mockResolvedValueOnce([]);

    res = await detailGET(new Request('http://localhost'), { params: { id: 'evt-1' } });
    expect(res.status).toBe(200);
  });

  test('moderation mutations enforce 401/403 and allow moderator+', async () => {
    const { POST: approvePOST } = await import('@/app/api/admin/moderation/events/[id]/approve/route');
    const { POST: rejectPOST } = await import('@/app/api/admin/moderation/events/[id]/reject/route');

    requireRoleMock.mockRejectedValueOnce(new Response('Unauthorized', { status: 401 }));
    let res = await approvePOST(new Request('http://localhost', { method: 'POST' }), { params: { id: 'evt-1' } });
    expect(res.status).toBe(401);

    requireRoleMock.mockRejectedValueOnce(new Response('Forbidden', { status: 403 }));
    res = await rejectPOST(new Request('http://localhost', { method: 'POST', body: '{}' }), { params: { id: 'evt-1' } });
    expect(res.status).toBe(403);

    requireRoleMock.mockResolvedValueOnce({ user: { id: 'm1', role: 'moderator', status: 'ACTIVE' } });
    prismaMock.ingestExtractedEvent.findUnique.mockResolvedValueOnce({ id: 'evt-1', configVersion: 1 });
    prismaMock.ingestExtractedEvent.update.mockResolvedValueOnce({ id: 'evt-1', configVersion: 1 });
    prismaMock.pipelineTelemetry.create.mockResolvedValueOnce({ id: 't3' });

    res = await approvePOST(new Request('http://localhost', { method: 'POST' }), { params: { id: 'evt-1' } });
    expect(res.status).toBe(200);

    requireRoleMock.mockResolvedValueOnce({ user: { id: 'm1', role: 'moderator', status: 'ACTIVE' } });
    prismaMock.ingestExtractedEvent.findUnique.mockResolvedValueOnce({ id: 'evt-1', status: 'PENDING', configVersion: 1 });
    prismaMock.ingestExtractedEvent.update.mockResolvedValueOnce({ id: 'evt-1', configVersion: 1 });
    prismaMock.pipelineTelemetry.create.mockResolvedValueOnce({ id: 't4' });

    res = await rejectPOST(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reasonCode: 'DUPLICATE' })
      }),
      { params: { id: 'evt-1' } }
    );
    expect(res.status).toBe(200);
  });

  test('recovery actions and invite endpoints enforce 401/403 and allow required roles', async () => {
    const { POST: recoveryPOST } = await import('@/app/api/admin/recovery/actions/route');
    const { POST: invitePOST } = await import('@/app/api/admin/system/users/invite/route');

    requireRoleMock.mockRejectedValueOnce(new Response('Unauthorized', { status: 401 }));
    let res = await recoveryPOST(new Request('http://localhost', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(401);

    requireRoleMock.mockRejectedValueOnce(new Response('Forbidden', { status: 403 }));
    res = await invitePOST(new Request('http://localhost', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(403);

    requireRoleMock.mockResolvedValueOnce({ user: { id: 'op1', email: 'op@example.test', role: 'operator', status: 'ACTIVE' } });
    prismaMock.siteSetting.upsert.mockResolvedValueOnce({});
    prismaMock.pipelineTelemetry.create.mockResolvedValueOnce({ id: 'audit-1' });

    res = await recoveryPOST(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'pause_imports',
          scope: 'system',
          target: 'global',
          reason: 'pause for maintenance',
          confirmText: 'RECOVER'
        })
      })
    );
    expect(res.status).toBe(200);

    requireRoleMock.mockResolvedValueOnce({ user: { id: 'a1', role: 'admin', status: 'ACTIVE' } });
    prismaMock.adminUser.upsert.mockResolvedValueOnce({ id: 'admin-u1' });
    prismaMock.adminInvite.create.mockResolvedValueOnce({ id: 'inv-1' });

    res = await invitePOST(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'user@example.test', name: 'User', role: 'viewer' })
      })
    );
    expect(res.status).toBe(200);
  });
});
