import { beforeEach, describe, expect, test, vi } from 'vitest';

const requireRoleMock = vi.fn();
const requireAdminSessionMock = vi.fn();

const prismaMock = {
  pipelineConfigVersion: { findMany: vi.fn() },
  modelVersion: { findMany: vi.fn(), findUnique: vi.fn() },
  ingestExtractedEvent: { findMany: vi.fn(), count: vi.fn() },
  pipelineTelemetry: { count: vi.fn() },
  sourceDocument: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  ingestionJob: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  extractionRun: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
  proposedChangeSet: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  fieldReview: { create: vi.fn(), upsert: vi.fn(), findMany: vi.fn() },
  publishBatch: { create: vi.fn(), findMany: vi.fn() }
};

const redirectMock = vi.fn();
vi.mock('@/lib/auth-guard', () => ({
  requireRole: requireRoleMock,
  requireAdminSession: requireAdminSessionMock
}));

vi.mock('@/lib/db', () => ({
  prisma: prismaMock
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock
}));

describe('admin auth coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('middleware matcher uses negative-lookahead to protect all routes except public ones', async () => {
    const { config } = await import('@/middleware');

    expect(config.matcher).toHaveLength(2);
    const pattern = config.matcher[0];
    expect(pattern).toContain('login');
    expect(pattern).toContain('accept-invite');
    expect(pattern).toContain('api/auth');
    expect(pattern).toContain('_next');
    expect(config.matcher[1]).toBe('/api/admin/:path*');
  });

  test('admin layout redirects unauthenticated and unauthorized users', async () => {
    redirectMock.mockImplementation(() => {
      throw new Error('redirected');
    });

    requireAdminSessionMock.mockRejectedValueOnce(new Response('Unauthorized', { status: 401 }));
    const { default: AdminLayout } = await import('@/app/(admin)/layout');

    await expect(AdminLayout({ children: null })).rejects.toThrow('redirected');
    expect(redirectMock).toHaveBeenCalledWith('/login');

    requireAdminSessionMock.mockRejectedValueOnce(new Response('Forbidden', { status: 403 }));

    await expect(AdminLayout({ children: null })).rejects.toThrow('redirected');
    expect(redirectMock).toHaveBeenCalledWith('/');
  });

  test('config versions API rejects unauthenticated and non-admin callers, allows admin', async () => {
    const { GET } = await import('@/app/api/admin/config/versions/route');

    requireRoleMock.mockRejectedValueOnce(new Response('Unauthorized', { status: 401 }));
    let res = await GET();
    expect(res.status).toBe(401);

    requireRoleMock.mockRejectedValueOnce(new Response('Forbidden', { status: 403 }));
    res = await GET();
    expect(res.status).toBe(403);

    requireRoleMock.mockResolvedValueOnce({ user: { role: 'admin', status: 'ACTIVE' } });
    prismaMock.pipelineConfigVersion.findMany.mockResolvedValueOnce([{ id: 'cfg-1' }]);
    res = await GET();
    expect(res.status).toBe(200);
    expect(prismaMock.pipelineConfigVersion.findMany).toHaveBeenCalled();
  });

  test('models APIs reject unauthenticated and non-admin callers, allow admin', async () => {
    const { GET: getModels } = await import('@/app/api/admin/models/route');
    const { GET: getModelById } = await import('@/app/api/admin/models/[id]/route');

    requireRoleMock.mockRejectedValueOnce(new Response('Unauthorized', { status: 401 }));
    let res = await getModels();
    expect(res.status).toBe(401);

    requireRoleMock.mockRejectedValueOnce(new Response('Forbidden', { status: 403 }));
    res = await getModels();
    expect(res.status).toBe(403);

    requireRoleMock.mockResolvedValueOnce({ user: { role: 'admin', status: 'ACTIVE' } });
    prismaMock.modelVersion.findMany.mockResolvedValueOnce([{ id: 'm1' }]);
    res = await getModels();
    expect(res.status).toBe(200);

    requireRoleMock.mockResolvedValueOnce({ user: { role: 'admin', status: 'ACTIVE' } });
    prismaMock.modelVersion.findUnique.mockResolvedValueOnce({ id: 'm1' });
    res = await getModelById(new Request('http://localhost'), { params: { id: 'm1' } });
    expect(res.status).toBe(200);
  });

  test('moderation queue API rejects unauthenticated/non-admin and allows authorized admin roles', async () => {
    const { GET } = await import('@/app/api/admin/moderation/queue/route');

    requireRoleMock.mockRejectedValueOnce(new Response('Unauthorized', { status: 401 }));
    let res = await GET();
    expect(res.status).toBe(401);

    requireRoleMock.mockRejectedValueOnce(new Response('Forbidden', { status: 403 }));
    res = await GET();
    expect(res.status).toBe(403);

    requireRoleMock.mockResolvedValueOnce({ user: { role: 'moderator', status: 'ACTIVE' } });
    prismaMock.ingestExtractedEvent.findMany.mockResolvedValueOnce([{ id: 'evt-1' }]);
    res = await GET();
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.items).toEqual([{ id: 'evt-1' }]);
  });

  test('legacy moderation endpoints remain auth-protected while returning 410', async () => {
    const { POST: approveLegacy } = await import('@/app/api/admin/moderation/[id]/approve/route');
    const { POST: rejectLegacy } = await import('@/app/api/admin/moderation/[id]/reject/route');

    requireRoleMock.mockRejectedValueOnce(new Response('Unauthorized', { status: 401 }));
    await expect(approveLegacy()).rejects.toMatchObject({ status: 401 });

    requireRoleMock.mockRejectedValueOnce(new Response('Forbidden', { status: 403 }));
    await expect(rejectLegacy()).rejects.toMatchObject({ status: 403 });

    requireRoleMock.mockResolvedValueOnce({ user: { role: 'viewer', status: 'ACTIVE' } });
    const res = await approveLegacy();
    expect(res.status).toBe(410);
  });
});
