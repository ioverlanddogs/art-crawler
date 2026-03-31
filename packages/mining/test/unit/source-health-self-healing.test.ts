import { beforeEach, describe, expect, test, vi } from 'vitest';

const prismaMock = {
  trustedSource: {
    update: vi.fn(),
    findUniqueOrThrow: vi.fn()
  },
  pipelineTelemetry: {
    create: vi.fn()
  }
};

vi.mock('../../src/lib/db.js', () => ({ prisma: prismaMock }));

describe('source health self-healing actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.trustedSource.update.mockResolvedValue({ failureCount: 5, trustTier: 4 });
    prismaMock.pipelineTelemetry.create.mockResolvedValue({});
  });

  test('auto quarantines on threshold breach', async () => {
    const { markSourceFailure } = await import('../../src/lib/source-health.js');
    await markSourceFailure('source-1', 'extraction_missing_title_or_name');

    expect(prismaMock.trustedSource.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PAUSED'
        })
      })
    );
    expect(prismaMock.pipelineTelemetry.create).toHaveBeenCalled();
  });

  test('releases recovered source from quarantine', async () => {
    prismaMock.trustedSource.findUniqueOrThrow.mockResolvedValue({ id: 'source-2', failureCount: 1 });
    const { attemptSourceRecoveryRelease } = await import('../../src/lib/source-health.js');
    const released = await attemptSourceRecoveryRelease('source-2');

    expect(released).toBe(true);
    expect(prismaMock.trustedSource.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ACTIVE' })
      })
    );
  });

  test('supports false quarantine reversal', async () => {
    const { reverseFalseQuarantine } = await import('../../src/lib/source-health.js');
    await reverseFalseQuarantine('source-3', 'ops-user');

    expect(prismaMock.trustedSource.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'ACTIVE',
          notes: 'false_quarantine_reversal:ops-user',
          failureCount: 0
        })
      })
    );
  });
});
