import { describe, expect, test } from 'vitest';
import { enforceReplaySafety } from '@/lib/admin/recovery-replay';

describe('publish blocker replay safety', () => {
  test('publish readiness replay maintains blocker safeguards', () => {
    const safety = enforceReplaySafety({
      action: 'replay_publish_readiness_checks',
      targetType: 'publish_blocker_cluster',
      dryRun: true
    });

    expect(safety.allowCanonicalWrite).toBe(false);
    expect(safety.safeguards.join(' ')).toContain('Publish blockers remain enforced');
  });
});
