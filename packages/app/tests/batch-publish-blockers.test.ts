import { beforeEach, describe, expect, test, vi } from 'vitest';

const requireRoleMock = vi.fn();
const checkPublishReadinessMock = vi.fn();
const prismaMock = {
  event: { findMany: vi.fn() }
};

vi.mock('@/lib/auth-guard', () => ({ requireRole: requireRoleMock }));
vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/intake/publish-gate', () => ({ checkPublishReadiness: checkPublishReadinessMock }));

describe('batch publish blockers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ user: { id: 'op-1', role: 'operator', status: 'ACTIVE' } });
  });

  test('GET clusters blocked records by blocker reason', async () => {
    prismaMock.event.findMany.mockResolvedValueOnce([
      {
        id: 'evt-1',
        title: 'Blocked Event',
        publishStatus: 'ready',
        proposedChangeSets: [{ proposedDataJson: { title: 'a' }, fieldReviews: [], duplicateCandidates: [] }]
      },
      {
        id: 'evt-2',
        title: 'Ready Event',
        publishStatus: 'ready',
        proposedChangeSets: [{ proposedDataJson: { title: 'b' }, fieldReviews: [], duplicateCandidates: [] }]
      }
    ]);
    checkPublishReadinessMock
      .mockReturnValueOnce({ ready: false, blockers: ['duplicate unresolved'], warnings: [] })
      .mockReturnValueOnce({ ready: true, blockers: [], warnings: [] });

    const { GET } = await import('@/app/api/admin/publish/blockers/route');
    const response = await GET();

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data).toHaveLength(1);
    expect(payload.clusters).toEqual([{ blocker: 'duplicate unresolved', count: 1, eventIds: ['evt-1'] }]);
    expect(prismaMock.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { publishStatus: { in: ['ready', 'unpublished'] } } })
    );
  });
});
