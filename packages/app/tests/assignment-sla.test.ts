import { beforeEach, describe, expect, test, vi } from 'vitest';
import { calculateSlaState } from '@/lib/admin/assignment-sla';

const requireRoleMock = vi.fn();
const prismaMock = {
  proposedChangeSet: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  duplicateCandidate: { findUnique: vi.fn(), update: vi.fn() },
  event: { findUnique: vi.fn(), update: vi.fn() },
  pipelineTelemetry: { create: vi.fn() }
};

vi.mock('@/lib/auth-guard', () => ({ requireRole: requireRoleMock }));
vi.mock('@/lib/db', () => ({ prisma: prismaMock }));

describe('assignment + sla operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ user: { id: 'mod-1', role: 'moderator', status: 'ACTIVE' } });
  });

  test('overdue SLA calculation marks item overdue when dueAt is in the past', () => {
    const state = calculateSlaState({ assignedReviewerId: 'rev-1', escalationLevel: 0, dueAt: new Date('2026-01-01T00:00:00.000Z') }, new Date('2026-01-02T00:00:00.000Z'));
    expect(state).toBe('overdue');
  });

  test('PATCH workbench assignment supports ownership transfer continuity', async () => {
    const { PATCH } = await import('@/app/api/admin/workbench/[changeSetId]/assignment/route');
    prismaMock.proposedChangeSet.findUnique.mockResolvedValueOnce({ id: 'pcs-1', assignedReviewerId: 'rev-1', dueAt: new Date('2026-04-01T00:00:00.000Z'), escalationLevel: 0, slaState: 'assigned' });
    prismaMock.proposedChangeSet.update.mockResolvedValueOnce({ id: 'pcs-1', assignedReviewerId: 'rev-2', escalationLevel: 0, slaState: 'assigned' });

    const response = await PATCH(new Request('http://localhost', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'reassign', reviewerId: 'rev-2' }) }), { params: { changeSetId: 'pcs-1' } });

    expect(response.status).toBe(200);
    expect(prismaMock.proposedChangeSet.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ assignedReviewerId: 'rev-2', assignedAt: expect.any(Date) }) }));
  });

  test('PATCH duplicate assignment escalation emits audit telemetry event', async () => {
    const { PATCH } = await import('@/app/api/admin/duplicates/[candidateId]/assignment/route');
    prismaMock.duplicateCandidate.findUnique.mockResolvedValueOnce({ id: 'dup-1', assignedReviewerId: 'rev-2', dueAt: new Date('2026-04-01T00:00:00.000Z'), escalationLevel: 0, slaState: 'assigned' });
    prismaMock.duplicateCandidate.update.mockResolvedValueOnce({ id: 'dup-1', assignedReviewerId: 'rev-2', escalationLevel: 1, slaState: 'escalated' });

    const response = await PATCH(new Request('http://localhost', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'escalate' }) }), { params: { candidateId: 'dup-1' } });

    expect(response.status).toBe(200);
    expect(prismaMock.pipelineTelemetry.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ stage: 'assignment', detail: 'duplicate:escalate' }) }));
  });
});
