import { describe, expect, test } from 'vitest';
import { buildDryRunComparison } from '@/lib/admin/recovery-replay';

describe('dry-run replay diff', () => {
  test('returns field diff and core deltas', () => {
    const diff = buildDryRunComparison({
      before: {
        title: 'Old Show',
        confidenceScore: 40,
        duplicateRisk: 70,
        publishReadiness: 20,
        parserVersion: 'p1',
        modelVersion: 'm1',
        sourceHealth: 'degraded'
      },
      simulatedAfter: {
        title: 'Old Show',
        confidenceScore: 65,
        duplicateRisk: 45,
        publishReadiness: 60,
        parserVersion: 'p2',
        modelVersion: 'm2',
        sourceHealth: 'healthy'
      }
    });

    expect(diff.confidenceDelta).toBe(25);
    expect(diff.duplicateRiskDelta).toBe(-25);
    expect(diff.publishReadinessDelta).toBe(40);
    expect(diff.fieldDiff.find((row) => row.field === 'parserVersion')?.changed).toBe(true);
  });
});
