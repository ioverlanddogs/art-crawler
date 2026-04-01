import { beforeEach, describe, expect, test, vi } from 'vitest';

const prismaMock = {
  trustedSource: {
    update: vi.fn(),
    findUniqueOrThrow: vi.fn()
  },
  pipelineTelemetry: {
    create: vi.fn(),
    findMany: vi.fn()
  }
};

vi.mock('../../src/lib/db.js', () => ({ prisma: prismaMock }));

describe('source health self-healing actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.trustedSource.findUniqueOrThrow.mockResolvedValue({ id: 'source-1', failureCount: 4, reliabilityCounters: {} });
    prismaMock.trustedSource.update.mockResolvedValue({ failureCount: 5, trustTier: 4, reliabilityCounters: { parserFailureSpike: 1 } });
    prismaMock.pipelineTelemetry.create.mockResolvedValue({});
    prismaMock.pipelineTelemetry.findMany.mockResolvedValue([]);
  });

  test('auto quarantines on threshold breach and emits mapped telemetry events', async () => {
    const { markSourceFailure } = await import('../../src/lib/source-health.js');
    await markSourceFailure('source-1', 'extraction_missing_title_or_name');

    expect(prismaMock.trustedSource.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PAUSED'
        })
      })
    );

    const calls = prismaMock.pipelineTelemetry.create.mock.calls.map((call) => JSON.parse(call[0].data.detail));
    expect(calls.some((detail) => detail.event === 'fallback_chain_applied')).toBe(true);
    expect(calls.some((detail) => detail.event === 'source_quarantined')).toBe(true);
    expect(calls.some((detail) => detail.event === 'source_paused')).toBe(true);
    expect(calls.some((detail) => detail.event === 'source_deprioritized')).toBe(true);
  });

  test('releases recovered source from quarantine with release evidence event', async () => {
    prismaMock.trustedSource.findUniqueOrThrow.mockResolvedValue({ id: 'source-2', failureCount: 1 });
    const { attemptSourceRecoveryRelease } = await import('../../src/lib/source-health.js');
    const released = await attemptSourceRecoveryRelease('source-2');

    expect(released).toBe(true);
    expect(prismaMock.trustedSource.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ACTIVE' })
      })
    );

    const calls = prismaMock.pipelineTelemetry.create.mock.calls.map((call) => JSON.parse(call[0].data.detail));
    expect(calls.some((detail) => detail.event === 'source_released')).toBe(true);
  });

  test('supports false quarantine reversal with attributable audit detail', async () => {
    const { reverseFalseQuarantine } = await import('../../src/lib/source-health.js');
    await reverseFalseQuarantine('source-3', 'ops-user');

    expect(prismaMock.trustedSource.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'ACTIVE',
          failureCount: 0
        })
      })
    );

    const calls = prismaMock.pipelineTelemetry.create.mock.calls.map((call) => JSON.parse(call[0].data.detail));
    expect(calls.some((detail) => detail.event === 'false_quarantine_reversed' && detail.reversalReason === 'manual_override:ops-user')).toBe(true);
  });

  test('does not release quarantine prematurely when reliability remains unstable', async () => {
    prismaMock.trustedSource.findUniqueOrThrow.mockResolvedValue({ id: 'source-4', failureCount: 4 });
    const { attemptSourceRecoveryRelease } = await import('../../src/lib/source-health.js');
    const released = await attemptSourceRecoveryRelease('source-4');

    expect(released).toBe(false);
    const calls = prismaMock.pipelineTelemetry.create.mock.calls.map((call) => JSON.parse(call[0].data.detail));
    expect(calls.some((detail) => detail.event === 'source_release_blocked')).toBe(true);
    expect(calls.some((detail) => detail.event === 'source_released')).toBe(false);
  });
});
