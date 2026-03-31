import { beforeEach, describe, expect, test, vi } from 'vitest';

const requireRoleMock = vi.fn();
const runIntakeMock = vi.fn();

const prismaMock = {
  sourceDocument: { findMany: vi.fn() }
};

vi.mock('@/lib/auth-guard', () => ({ requireRole: requireRoleMock }));
vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/intake/intake-service', () => ({ runIntake: runIntakeMock }));

describe('batch intake route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ user: { id: 'op-1', role: 'operator', status: 'ACTIVE' } });
  });

  test('supports dry-run validation with duplicate + warning detection', async () => {
    prismaMock.sourceDocument.findMany.mockResolvedValueOnce([{ sourceUrl: 'https://dup.example/a' }]);

    const { POST } = await import('@/app/api/admin/intake/batch/route');
    const response = await POST(
      new Request('http://localhost/api/admin/intake/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          dryRun: true,
          urlList: 'https://dup.example/a\nhttps://fresh.example/b\nhttps://img.example/image.jpg'
        })
      })
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.dryRun).toBe(true);
    expect(payload.duplicateUrls).toEqual(['https://dup.example/a']);
    expect(payload.formatWarnings).toEqual(['https://img.example/image.jpg']);
    expect(payload.validUrls).toEqual(['https://fresh.example/b', 'https://img.example/image.jpg']);
    expect(runIntakeMock).not.toHaveBeenCalled();
  });

  test('queues valid URLs when dry-run disabled', async () => {
    prismaMock.sourceDocument.findMany.mockResolvedValueOnce([]);
    runIntakeMock.mockResolvedValue({ ingestionJobId: 'job-1', finalStatus: 'needs_review' });

    const { POST } = await import('@/app/api/admin/intake/batch/route');
    const response = await POST(
      new Request('http://localhost/api/admin/intake/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ urls: ['https://fresh.example/a'], dryRun: false, priority: 'high' })
      })
    );

    expect(response.status).toBe(200);
    expect(runIntakeMock).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ queued: [{ sourceUrl: 'https://fresh.example/a', ingestionJobId: 'job-1', status: 'needs_review' }] }));
  });
});
