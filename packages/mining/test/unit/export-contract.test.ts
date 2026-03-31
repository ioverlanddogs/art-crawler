import { afterEach, describe, expect, test, vi } from 'vitest';
import { buildExportPayload, sendImportBatch } from '../../src/lib/export.js';

describe('mining -> app import contract', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.PIPELINE_IMPORT_URL;
    delete process.env.MINING_IMPORT_SECRET;
    delete process.env.MINING_SERVICE_SECRET;
  });

  test('buildExportPayload emits app import request schema', () => {
    const payload = buildExportPayload({
      sourceUrl: 'https://example.test/source',
      fingerprint: 'unused-fingerprint',
      confidenceScore: 0.72,
      configVersion: 3,
      region: 'us',
      normalizedJson: {
        title: 'Contract Candidate',
        venueUrl: 'https://example.test/events',
        startAt: '2026-02-01T19:00:00.000Z',
        timezone: 'UTC',
        observationCount: 5
      }
    });

    expect(payload).toEqual({
      source: 'mining-service-v1',
      region: 'us',
      events: [
        {
          title: 'Contract Candidate',
          venueUrl: 'https://example.test/events',
          startAt: '2026-02-01T19:00:00.000Z',
          timezone: 'UTC',
          source: 'mining-service-v1',
          miningConfidenceScore: 72,
          observationCount: 5,
          endAt: undefined,
          locationText: undefined,
          description: undefined,
          artistNames: undefined,
          imageUrl: undefined,
          sourceUrl: 'https://example.test/source',
          crossSourceMatches: undefined
        }
      ]
    });
  });


  test('sendImportBatch uses canonical MINING_IMPORT_SECRET when both env vars are set', async () => {
    process.env.PIPELINE_IMPORT_URL = 'https://app.example.test/api/pipeline/import';
    process.env.MINING_IMPORT_SECRET = 'canonical-secret';
    process.env.MINING_SERVICE_SECRET = 'legacy-secret';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      async json() {
        return { imported: 1, skipped: 0, errors: [], importBatchId: 'batch_123', disabled: false };
      }
    });
    vi.stubGlobal('fetch', fetchMock);

    await sendImportBatch({ source: 'mining-service-v1', region: 'us', events: [] });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://app.example.test/api/pipeline/import',
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer canonical-secret'
        })
      })
    );
  });


  test('sendImportBatch accepts legacy MINING_SERVICE_SECRET fallback', async () => {
    process.env.PIPELINE_IMPORT_URL = 'https://app.example.test/api/pipeline/import';
    delete process.env.MINING_IMPORT_SECRET;
    process.env.MINING_SERVICE_SECRET = 'legacy-secret';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      async json() {
        return { imported: 1, skipped: 0, errors: [], importBatchId: 'batch_legacy', disabled: false };
      }
    });
    vi.stubGlobal('fetch', fetchMock);

    await sendImportBatch({ source: 'mining-service-v1', region: 'us', events: [] });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://app.example.test/api/pipeline/import',
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer legacy-secret'
        })
      })
    );
  });

  test('sendImportBatch fails clearly when PIPELINE_IMPORT_URL is missing', async () => {
    process.env.MINING_IMPORT_SECRET = 'top-secret';

    await expect(sendImportBatch({})).rejects.toThrow('PIPELINE_IMPORT_URL');
  });

  test('sendImportBatch parses route response shape', async () => {
    process.env.PIPELINE_IMPORT_URL = 'https://app.example.test/api/pipeline/import';
    process.env.MINING_IMPORT_SECRET = 'top-secret';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      async json() {
        return { imported: 1, skipped: 0, errors: [], importBatchId: 'batch_123', disabled: false };
      }
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendImportBatch({ source: 'mining-service-v1', region: 'us', events: [] });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://app.example.test/api/pipeline/import',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer top-secret'
        })
      })
    );
    expect(result).toEqual({ imported: 1, skipped: 0, errors: [], importBatchId: 'batch_123', disabled: false });
  });

  test('sendImportBatch rejects malformed response payloads', async () => {
    process.env.PIPELINE_IMPORT_URL = 'https://app.example.test/api/pipeline/import';
    process.env.MINING_IMPORT_SECRET = 'top-secret';

    vi.stubGlobal('fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        async json() {
          return { batchId: 'legacy', inserted: 1 };
        }
      })
    );

    await expect(sendImportBatch({})).rejects.toThrow();
  });
});
