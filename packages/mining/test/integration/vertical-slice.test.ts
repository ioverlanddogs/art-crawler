import { describe, expect, test } from 'vitest';
import { buildExportPayload } from '../../src/lib/export.js';

describe('vertical slice contract', () => {
  test('export payload emits deterministic candidate packet shape', () => {
    const payload = buildExportPayload(
      {
        sourceUrl: 'https://example.test/item-1',
        fingerprint: 'fp-1',
        confidenceScore: 0.8,
        configVersion: 7,
        normalizedJson: { title: 'Demo Candidate', platform: 'web' }
      },
      'batch-1'
    );

    expect(payload.externalBatchId).toBe('batch-1');
    expect(payload.candidates).toHaveLength(1);
    expect(payload.candidates[0]).toMatchObject({
      title: 'Demo Candidate',
      sourceUrl: 'https://example.test/item-1',
      sourcePlatform: 'web',
      fingerprint: 'fp-1',
      confidenceScore: 0.8
    });
  });
});
