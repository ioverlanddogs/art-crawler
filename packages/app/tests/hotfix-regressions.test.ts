import { describe, expect, test, vi, beforeEach } from 'vitest';
import { processImportBatch } from '@/lib/pipeline/import-service';
import { POST as legacyApprovePost } from '@/app/api/admin/moderation/[id]/approve/route';
import { POST as legacyRejectPost } from '@/app/api/admin/moderation/[id]/reject/route';

const { requireRoleMock, prismaMock } = vi.hoisted(() => ({
  requireRoleMock: vi.fn(),
  prismaMock: {
    pipelineConfigVersion: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn()
    },
    pipelineTelemetry: {
      create: vi.fn()
    },
    sourceDocument: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    ingestionJob: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    extractionRun: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
    proposedChangeSet: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    fieldReview: { create: vi.fn(), upsert: vi.fn(), findMany: vi.fn() },
    publishBatch: { create: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn()
  }
}));

vi.mock('@/lib/auth-guard', () => ({
  requireRole: requireRoleMock
}));

vi.mock('@/lib/db', () => ({
  prisma: prismaMock
}));

describe('post-hotfix regressions (app)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('config activation transitions ACTIVE->ARCHIVED then target->ACTIVE', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    requireRoleMock.mockResolvedValue({ user: { id: 'u1', email: 'ops@example.test' } });
    prismaMock.pipelineConfigVersion.findUnique.mockResolvedValue({ id: 'cfg-2', region: 'us', version: 9 });
    prismaMock.pipelineConfigVersion.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.pipelineConfigVersion.update.mockResolvedValue({ id: 'cfg-2', region: 'us', version: 9, status: 'ACTIVE' });
    prismaMock.pipelineTelemetry.create.mockResolvedValue({});
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));

    const { POST } = await import('@/app/api/admin/config/activate/route');
    const res = await POST(
      new Request('http://localhost/api/admin/config/activate', {
        method: 'POST',
        body: JSON.stringify({ id: 'cfg-2', reason: 'Promote after validation', confirmText: 'ACTIVATE' }),
        headers: { 'content-type': 'application/json' }
      })
    );

    expect(res.status).toBe(200);
    expect(prismaMock.pipelineConfigVersion.updateMany).toHaveBeenCalledWith({
      where: { region: 'us', status: 'ACTIVE', id: { not: 'cfg-2' } },
      data: { status: 'ARCHIVED' }
    });
    expect(prismaMock.pipelineConfigVersion.update).toHaveBeenCalledWith({
      where: { id: 'cfg-2' },
      data: expect.objectContaining({ status: 'ACTIVE', activatedBy: 'u1', changeReason: 'Promote after validation' })
    });

    vi.useRealTimers();
  });

  test('legacy moderation routes require auth before returning gone', async () => {
    requireRoleMock.mockRejectedValueOnce(new Response('Unauthorized', { status: 401 }));
    await expect(legacyApprovePost()).rejects.toMatchObject({ status: 401 });

    requireRoleMock.mockRejectedValueOnce(new Response('Forbidden', { status: 403 }));
    await expect(legacyRejectPost()).rejects.toMatchObject({ status: 403 });

    requireRoleMock.mockResolvedValueOnce({ user: { id: 'u1', email: 'ops@example.test' } });
    requireRoleMock.mockResolvedValueOnce({ user: { id: 'u1', email: 'ops@example.test' } });
    const approveRes = await legacyApprovePost();
    const rejectRes = await legacyRejectPost();

    expect(approveRes.status).toBe(410);
    expect(rejectRes.status).toBe(410);
  });

  test('shadow-mode imports are suppressed while mining_import_enabled=false', async () => {
    const db = {
      events: [] as any[],
      batches: [] as any[]
    };

    const prisma = {
      siteSetting: {
        async findUnique() {
          return { key: 'mining_import_enabled', value: 'false' };
        }
      },
      importBatch: {
        async create({ data }: any) {
          db.batches.push(data);
          return { id: 'batch-1' };
        },
        async update() {
          return { id: 'batch-1' };
        }
      },
      ingestExtractedEvent: {
        async findUnique() {
          return null;
        },
        async create({ data }: any) {
          db.events.push(data);
        }
      },
      venueProfile: {
        async upsert() {
          return {};
        }
      }
    } as any;

    const result = await processImportBatch(prisma, {
      source: 'mining-service-v1',
      region: 'us',
      events: [
        {
          venueUrl: 'https://venue.example/events',
          title: 'Suppressed Candidate',
          startAt: '2026-01-03T20:00:00.000Z',
          timezone: 'UTC',
          source: 'mining-service-v1',
          miningConfidenceScore: 88,
          observationCount: 3
        }
      ]
    });

    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.disabled).toBe(true);
    expect(result.importBatchId).toBeNull();
    expect(db.batches).toHaveLength(0);
    expect(db.events).toHaveLength(0);
  });


  test('ui callers use /api/admin/moderation/events routes (no deprecated callers)', async () => {
    const fs = await import('node:fs/promises');
    const text = await fs.readFile(new URL('../app/(admin)/moderation/ModerationClient.tsx', import.meta.url), 'utf8');
    expect(text).toContain('/api/admin/moderation/events');
    expect(text).not.toMatch(/\/api\/admin\/moderation\/(?!events)/);
  });

  test('dashboard model CTAs point to the real model versions anchor', async () => {
    const fs = await import('node:fs/promises');
    const dashboard = await fs.readFile(new URL('../app/(admin)/dashboard/page.tsx', import.meta.url), 'utf8');
    const configClient = await fs.readFile(new URL('../app/(admin)/config/ConfigClient.tsx', import.meta.url), 'utf8');
    expect(dashboard).toContain('/config#model-versions');
    expect(dashboard).not.toContain('/config?tab=model');
    expect(configClient).toContain('id="model-versions"');
  });

  test('moderation slash shortcut respects editable fields', async () => {
    const fs = await import('node:fs/promises');
    const text = await fs.readFile(new URL('../app/(admin)/moderation/ModerationClient.tsx', import.meta.url), 'utf8');
    expect(text).toContain('function isEditableTarget');
    expect(text).toContain('if (event.key === \'/\')');
    expect(text).toContain('if (inTypingField) return;');
  });

  test('admin topbar actions are hidden when role cannot access those routes', async () => {
    const fs = await import('node:fs/promises');
    const text = await fs.readFile(new URL('../components/admin/AdminShell.tsx', import.meta.url), 'utf8');
    expect(text).toContain('const canOpenModeration = visibleHrefs.has(\'/moderation\')');
    expect(text).toContain('const canInvestigate = visibleHrefs.has(\'/investigations\')');
    expect(text).toContain('{canOpenModeration ? (');
    expect(text).toContain('{canInvestigate ? (');
  });

  test('no isActive assumption for PipelineConfigVersion activation', async () => {
    const fs = await import('node:fs/promises');
    const text = await fs.readFile(new URL('../app/api/admin/config/activate/route.ts', import.meta.url), 'utf8');
    expect(text).toContain("status: 'ACTIVE'");
    expect(text).not.toContain('isActive');
  });

  test('role guard literals remain lowercase prisma enum values', async () => {
    const fs = await import('node:fs/promises');
    const text = await fs.readFile(new URL('../lib/auth-guard.ts', import.meta.url), 'utf8');
    expect(text).toContain("'viewer'");
    expect(text).toContain("'moderator'");
    expect(text).toContain("'operator'");
    expect(text).toContain("'admin'");
    expect(text).not.toContain('\'ADMIN\'');
  });
});
