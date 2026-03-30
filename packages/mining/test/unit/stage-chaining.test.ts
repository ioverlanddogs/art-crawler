import { describe, expect, test, vi, beforeEach } from 'vitest';
import { enqueueNextStage, nextStageJobId } from '../../src/lib/stage-chaining.js';

const queueAdd = vi.fn();

vi.mock('../../src/queues.js', () => ({
  extractQueue: { add: queueAdd }
}));

const prismaMock = {
  miningCandidate: {
    findUniqueOrThrow: vi.fn(),
    update: vi.fn()
  },
  pipelineTelemetry: {
    create: vi.fn()
  }
};

vi.mock('../../src/lib/db.js', () => ({
  prisma: prismaMock
}));

describe('stage chaining idempotency and progression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('uses deterministic downstream job ids to suppress retry fan-out', async () => {
    const queue = { add: vi.fn() };
    await enqueueNextStage(queue, 'extract', 'cand-42');
    expect(queue.add).toHaveBeenCalledWith('extract', { candidateId: 'cand-42' }, { jobId: 'extract:cand-42' });
    expect(nextStageJobId('extract', 'cand-42')).toBe('extract:cand-42');
  });

  test('fetch stage enqueues extract on success', async () => {
    prismaMock.miningCandidate.findUniqueOrThrow.mockResolvedValue({
      id: 'cand-1',
      sourceUrl: 'https://example.test/event',
      configVersion: 1
    });
    prismaMock.miningCandidate.update.mockResolvedValue({});
    prismaMock.pipelineTelemetry.create.mockResolvedValue({});

    const { runFetch } = await import('../../src/workers/fetch.js');
    await runFetch('cand-1');

    expect(queueAdd).toHaveBeenCalledWith('extract', { candidateId: 'cand-1' }, { jobId: 'extract:cand-1' });
  });
});
