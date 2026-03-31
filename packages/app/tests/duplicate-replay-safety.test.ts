import { describe, expect, test } from 'vitest';
import { enforceReplaySafety } from '@/lib/admin/recovery-replay';

describe('duplicate replay safety', () => {
  test('duplicate compare replay cannot write canonical records', () => {
    const safety = enforceReplaySafety({
      action: 'replay_duplicate_compare',
      targetType: 'duplicate_candidate',
      dryRun: true
    });

    expect(safety.allowCanonicalWrite).toBe(false);
    expect(safety.safeguards.join(' ')).toContain('Duplicate safeguards remain active');
  });
});
