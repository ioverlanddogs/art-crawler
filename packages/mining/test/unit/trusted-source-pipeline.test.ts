import { beforeEach, describe, expect, test, vi } from 'vitest';
import { computeSignals } from '../../src/lib/signals.js';

const prismaMock = {
  trustedSource: {
    findMany: vi.fn(),
    update: vi.fn()
  },
  miningCandidate: {
    findMany: vi.fn(),
    create: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    update: vi.fn()
  },
  pipelineTelemetry: {
    create: vi.fn()
  }
};

const enqueueNextStageMock = vi.fn();
const markSourceFailureMock = vi.fn();
const markSourceSuccessMock = vi.fn();

vi.mock('../../src/lib/db.js', () => ({ prisma: prismaMock }));
vi.mock('../../src/lib/config.js', () => ({
  loadActiveConfig: vi.fn().mockResolvedValue({ version: 9 })
}));
vi.mock('../../src/queues.js', () => ({
  fetchQueue: { add: vi.fn() },
  extractQueue: { add: vi.fn() }
}));
vi.mock('../../src/lib/stage-chaining.js', () => ({
  enqueueNextStage: enqueueNextStageMock
}));
vi.mock('../../src/lib/source-health.js', () => ({
  isSourceHealthy: (source: { failureCount: number; status: string }) => source.status === 'ACTIVE' && source.failureCount < 5,
  markSourceFailure: markSourceFailureMock,
  markSourceSuccess: markSourceSuccessMock
}));

const activeSource = {
  id: 'source-active',
  status: 'ACTIVE',
  failureCount: 0,
  seedUrl: 'https://Example.test/events/',
  domain: 'example.test',
  sourceType: 'museum',
  region: 'us-ca',
  trustTier: 5,
  allowedPathPatterns: ['/events'],
  blockedPathPatterns: ['/admin']
};

const unhealthySource = {
  ...activeSource,
  id: 'source-unhealthy',
  failureCount: 5
};

describe('trusted source discovery/fetch hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.trustedSource.update.mockResolvedValue({});
    prismaMock.pipelineTelemetry.create.mockResolvedValue({});
    prismaMock.miningCandidate.update.mockResolvedValue({});
  });

  test('seeds from ACTIVE and healthy trusted source only', async () => {
    prismaMock.trustedSource.findMany.mockResolvedValue([activeSource, unhealthySource]);
    prismaMock.miningCandidate.findMany.mockResolvedValue([]);
    prismaMock.miningCandidate.create.mockResolvedValue({ id: 'cand-1' });

    const { runDiscovery } = await import('../../src/workers/discovery.js');
    const candidate = await runDiscovery(false);

    expect(candidate.id).toBe('cand-1');
    expect(prismaMock.miningCandidate.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.miningCandidate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceId: 'source-active',
          sourceUrl: 'https://example.test/events'
        })
      })
    );

    expect(prismaMock.pipelineTelemetry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stage: 'discovery',
          status: 'skip',
          detail: expect.stringContaining('source_unhealthy_or_paused')
        })
      })
    );
  });

  test('suppresses duplicate seeded URLs with normalized matching and stays idempotent', async () => {
    prismaMock.trustedSource.findMany.mockResolvedValue([activeSource]);
    prismaMock.miningCandidate.create.mockResolvedValue({ id: 'cand-2' });

    prismaMock.miningCandidate.findMany.mockResolvedValueOnce([]);
    const { runDiscovery } = await import('../../src/workers/discovery.js');
    await runDiscovery(false);

    prismaMock.miningCandidate.findMany.mockResolvedValueOnce([
      { id: 'cand-2', sourceUrl: 'https://example.test/events', canonicalUrl: null }
    ]);

    await expect(runDiscovery(false)).rejects.toThrow('No eligible trusted sources found for discovery');
    expect(prismaMock.miningCandidate.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.pipelineTelemetry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stage: 'discovery',
          status: 'skip',
          detail: expect.stringContaining('recent_duplicate_seed_url')
        })
      })
    );
  });

  test('rejects SSRF/private-network targets before fetch', async () => {
    prismaMock.miningCandidate.findUniqueOrThrow.mockResolvedValue({
      id: 'cand-ssrf',
      sourceId: 'source-active',
      sourceUrl: 'http://127.0.0.1/admin',
      configVersion: 9,
      source: activeSource
    });

    const { runFetch } = await import('../../src/workers/fetch.js');
    await expect(runFetch('cand-ssrf', false)).rejects.toThrow('URL is not approved by trusted source policy');

    expect(markSourceFailureMock).toHaveBeenCalledWith('source-active', 'url_not_approved_for_source');
    expect(prismaMock.miningCandidate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastError: 'url_not_approved_for_source',
          retryCount: { increment: 1 }
        })
      })
    );
  });

  test('rejects redirect chains that leave approved trusted-source scope', async () => {
    prismaMock.miningCandidate.findUniqueOrThrow.mockResolvedValue({
      id: 'cand-redirect',
      sourceId: 'source-active',
      sourceUrl: 'https://example.test/events/item-1',
      configVersion: 9,
      source: activeSource
    });

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          status: 302,
          ok: false,
          headers: { get: vi.fn().mockReturnValue('https://evil.test/phish') },
          text: vi.fn().mockResolvedValue('')
        })
    );

    const { runFetch } = await import('../../src/workers/fetch.js');
    await expect(runFetch('cand-redirect', false)).rejects.toThrow('redirect_left_approved_scope');

    expect(markSourceFailureMock).toHaveBeenCalledWith('source-active', 'redirect_left_approved_scope');
    expect(prismaMock.pipelineTelemetry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stage: 'fetch',
          status: 'failure'
        })
      })
    );
  });

  test('sets deterministic fetch metadata and clears lastError on success', async () => {
    prismaMock.miningCandidate.findUniqueOrThrow.mockResolvedValue({
      id: 'cand-success',
      sourceId: 'source-active',
      sourceUrl: 'https://example.test/events/item-2/',
      configVersion: 9,
      source: activeSource
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        headers: { get: vi.fn().mockReturnValue('text/html') },
        text: vi.fn().mockResolvedValue('<html><title>Event</title></html>')
      })
    );

    const { runFetch } = await import('../../src/workers/fetch.js');
    await runFetch('cand-success', false);

    expect(markSourceSuccessMock).toHaveBeenCalledWith('source-active');
    expect(prismaMock.miningCandidate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          canonicalUrl: 'https://example.test/events/item-2',
          fetchStatusCode: 200,
          fetchContentType: 'text/html',
          status: 'FETCHED',
          lastError: null
        })
      })
    );
  });
});

describe('extraction precedence and source-derived scoring signal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.pipelineTelemetry.create.mockResolvedValue({});
    prismaMock.miningCandidate.update.mockResolvedValue({});
  });

  test('uses parser precedence: JSON-LD > source parser > generic fallback', async () => {
    const { runExtract } = await import('../../src/workers/extract.js');

    const ai = { extract: vi.fn().mockResolvedValue({ title: 'ai-title', platform: 'generic' }) };

    prismaMock.miningCandidate.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'cand-jsonld',
      sourceId: 'source-active',
      configVersion: 9,
      html: '<script type="application/ld+json">{"name":"JSON Event"}</script>',
      entityType: 'museum',
      source: activeSource
    });
    await runExtract('cand-jsonld', ai, false);

    prismaMock.miningCandidate.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'cand-source-parser',
      sourceId: 'source-active',
      configVersion: 9,
      html: '<html><title>Museum Event</title></html>',
      entityType: 'museum',
      source: activeSource
    });
    await runExtract('cand-source-parser', ai, false);

    prismaMock.miningCandidate.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'cand-generic',
      sourceId: 'source-active',
      configVersion: 9,
      html: '<html><body>No title</body></html>',
      entityType: 'unknown',
      source: activeSource
    });
    await runExtract('cand-generic', ai, false);

    const parserTypes = prismaMock.miningCandidate.update.mock.calls.map((call) => call[0].data.parserType);
    expect(parserTypes).toEqual(['json_ld', 'source_type', 'generic_fallback']);
    expect(ai.extract).toHaveBeenCalledTimes(1);
  });

  test('computes source-derived scoring signals with clamped trust/performance values', () => {
    const signals = computeSignals({
      title: 'Event',
      sourceUrl: 'https://example.test/event',
      platform: 'museum_calendar',
      trustTier: 7,
      parserType: 'json_ld',
      extractionCompleteness: 2,
      sourceFailureCount: 3
    });

    expect(signals.trustTierScore).toBe(1);
    expect(signals.hasStructuredData).toBe(1);
    expect(signals.extractionCompleteness).toBe(1);
    expect(signals.sourcePerformance).toBe(0.7);
  });
});
