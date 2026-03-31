import { beforeEach, describe, expect, test, vi } from 'vitest';

const processImportBatchMock = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {}
}));

vi.mock('@/lib/pipeline/import-service', async () => {
  const actual = await vi.importActual<typeof import('@/lib/pipeline/import-service')>('@/lib/pipeline/import-service');
  return {
    ...actual,
    processImportBatch: processImportBatchMock
  };
});

describe('pipeline import route contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MINING_IMPORT_SECRET = 'route-secret';
    delete process.env.MINING_SERVICE_SECRET;
  });

  test('rejects malformed payloads', async () => {
    const { POST } = await import('@/app/api/pipeline/import/route');
    const response = await POST(
      new Request('http://localhost/api/pipeline/import', {
        method: 'POST',
        headers: { authorization: 'Bearer route-secret', 'content-type': 'application/json' },
        body: JSON.stringify({ externalBatchId: 'legacy', candidates: [] })
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(processImportBatchMock).not.toHaveBeenCalled();
  });


  test('rejects wrong secret', async () => {
    const { POST } = await import('@/app/api/pipeline/import/route');
    const response = await POST(
      new Request('http://localhost/api/pipeline/import', {
        method: 'POST',
        headers: { authorization: 'Bearer wrong-secret', 'content-type': 'application/json' },
        body: JSON.stringify({ source: 'mining-service-v1', region: 'us', events: [] })
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(processImportBatchMock).not.toHaveBeenCalled();
  });

  test('returns canonical response body on happy path', async () => {
    processImportBatchMock.mockResolvedValue({ imported: 1, skipped: 0, errors: [], importBatchId: 'batch_1', disabled: false });
    const { POST } = await import('@/app/api/pipeline/import/route');

    const response = await POST(
      new Request('http://localhost/api/pipeline/import', {
        method: 'POST',
        headers: { authorization: 'Bearer route-secret', 'content-type': 'application/json' },
        body: JSON.stringify({
          source: 'mining-service-v1',
          region: 'us',
          events: [
            {
              venueUrl: 'https://example.test/events',
              title: 'Route Candidate',
              startAt: '2026-01-10T18:00:00.000Z',
              timezone: 'UTC',
              source: 'mining-service-v1',
              miningConfidenceScore: 80,
              observationCount: 2
            }
          ]
        })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ imported: 1, skipped: 0, errors: [], importBatchId: 'batch_1', disabled: false });
  });
});
