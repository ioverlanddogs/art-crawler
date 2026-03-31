import { describe, expect, test } from 'vitest';
import { checkPublishReadiness } from '@/lib/intake/publish-gate';
import { mapResolutionToAuditEvent, summarizeDuplicateBlockers } from '@/lib/intake/duplicate-resolution';

describe('duplicate corroboration blockers', () => {
  test('flags unresolved duplicates and corroboration conflicts as publish blockers', () => {
    const gate = checkPublishReadiness({
      proposedDataJson: { title: 'Show', startAt: '2026-04-01T19:00:00Z' },
      fieldReviews: [
        { fieldPath: 'title', decision: 'accepted', confidence: 0.9 },
        { fieldPath: 'startAt', decision: 'accepted', confidence: 0.9 }
      ],
      duplicateCandidates: [
        {
          id: 'dup-1',
          resolutionStatus: 'unresolved',
          unresolvedBlockerCount: 1,
          conflictingSourceCount: 2,
          corroborationSourceCount: 0,
          corroborationConfidence: 0.2
        }
      ]
    });

    expect(gate.ready).toBe(false);
    expect(gate.blockers.join(' ')).toContain('unresolved duplicate');
    expect(gate.blockers.join(' ')).toContain('corroboration');
  });

  test('summarizeDuplicateBlockers supports separate-record and false-positive paths', () => {
    const summary = summarizeDuplicateBlockers([
      {
        id: 'dup-separate',
        resolutionStatus: 'resolved_separate',
        unresolvedBlockerCount: 0,
        conflictingSourceCount: 0,
        corroborationSourceCount: 1,
        corroborationConfidence: 0.8
      },
      {
        id: 'dup-false',
        resolutionStatus: 'false_positive',
        unresolvedBlockerCount: 0,
        conflictingSourceCount: 0,
        corroborationSourceCount: 1,
        corroborationConfidence: 0.8
      }
    ]);

    expect(summary.blockers).toEqual([]);
    expect(mapResolutionToAuditEvent('resolved_separate')).toBe('duplicate_resolved_separate');
    expect(mapResolutionToAuditEvent('false_positive')).toBe('duplicate_false_positive');
  });
});
