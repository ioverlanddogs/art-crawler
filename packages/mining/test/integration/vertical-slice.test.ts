import { describe, expect, test } from 'vitest';
import { buildExportPayload } from '../../src/lib/export.js';

describe('vertical slice contract', () => {
  test('export payload emits deterministic candidate packet shape', () => {
    const payload = buildExportPayload({
      sourceUrl: 'https://example.test/item-1',
      fingerprint: 'fp-1',
      confidenceScore: 0.8,
      configVersion: 7,
      region: 'us',
      normalizedJson: {
        title: 'Demo Candidate',
        venueUrl: 'https://example.test/events',
        startAt: '2026-01-10T18:00:00.000Z',
        timezone: 'UTC',
        observationCount: 3
      }
    });

    expect(payload.source).toBe('mining-service-v1');
    expect(payload.region).toBe('us');
    expect(payload.events).toHaveLength(1);
    expect(payload.events[0]).toMatchObject({
      title: 'Demo Candidate',
      venueUrl: 'https://example.test/events',
      startAt: '2026-01-10T18:00:00.000Z',
      timezone: 'UTC',
      source: 'mining-service-v1',
      miningConfidenceScore: 80,
      observationCount: 3,
      sourceUrl: 'https://example.test/item-1',
    });
  });
});
