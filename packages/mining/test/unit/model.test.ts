import { describe, expect, test } from 'vitest';
import { inferScore } from '../../src/lib/model.js';

describe('confidence model defaults', () => {
  test('applies weights for all computed source signals', () => {
    const score = inferScore({
      hasTitle: 1,
      httpsSource: 1,
      knownPlatform: 1,
      trustTierScore: 1,
      hasStructuredData: 1,
      extractionCompleteness: 1,
      sourcePerformance: 1
    });

    expect(score).toBeGreaterThan(0.8);
  });
});
