import { describe, expect, test } from 'vitest';
import { checkPublishReadiness } from '@/lib/intake/publish-gate';
import { computeDiff } from '@/lib/intake/compute-diff';

describe('workbench services', () => {
  test('computeDiff marks all fields as added when canonical is null', () => {
    const result = computeDiff({ title: 'New event', startAt: '2026-04-01T19:00:00Z' }, null);

    expect(result.fields.every((field) => field.state === 'added')).toBe(true);
    expect(result.addedCount).toBe(2);
  });

  test('computeDiff marks matching values unchanged and differing values updated', () => {
    const result = computeDiff(
      { title: 'A', startAt: '2026-04-01T19:00:00Z', location: 'Room 2' },
      { title: 'A', startAt: '2026-04-01T19:00:00Z', location: 'Room 3' }
    );

    expect(result.fields.find((field) => field.fieldPath === 'title')?.state).toBe('unchanged');
    expect(result.fields.find((field) => field.fieldPath === 'location')?.state).toBe('updated');
  });

  test('checkPublishReadiness blocks when title is missing', () => {
    const result = checkPublishReadiness({
      proposedDataJson: { startAt: '2026-04-01T19:00:00Z' },
      fieldReviews: [{ fieldPath: 'startAt', decision: 'accepted', confidence: 0.9 }]
    });

    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("Required field 'title' is missing or rejected.");
  });

  test('checkPublishReadiness ready when required fields accepted and all reviewed', () => {
    const result = checkPublishReadiness({
      proposedDataJson: { title: 'Gallery Night', startAt: '2026-04-01T19:00:00Z' },
      fieldReviews: [
        { fieldPath: 'title', decision: 'accepted', confidence: 0.8 },
        { fieldPath: 'startAt', decision: 'accepted', confidence: 0.8 }
      ]
    });

    expect(result.ready).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  test('checkPublishReadiness blocks when unreviewed fields exist', () => {
    const result = checkPublishReadiness({
      proposedDataJson: { title: 'Gallery Night', startAt: '2026-04-01T19:00:00Z' },
      fieldReviews: [
        { fieldPath: 'title', decision: 'accepted', confidence: 0.8 },
        { fieldPath: 'startAt', decision: null, confidence: 0.8 }
      ]
    });

    expect(result.ready).toBe(false);
    expect(result.blockers).toContain('1 field(s) have not been reviewed.');
  });

  test('checkPublishReadiness emits warning for low-confidence accepted field', () => {
    const result = checkPublishReadiness({
      proposedDataJson: { title: 'Gallery Night', startAt: '2026-04-01T19:00:00Z' },
      fieldReviews: [
        { fieldPath: 'title', decision: 'accepted', confidence: 0.4 },
        { fieldPath: 'startAt', decision: 'accepted', confidence: 0.9 }
      ]
    });

    expect(result.ready).toBe(true);
    expect(result.warnings).toContain('Low-confidence field accepted: title.');
  });
});
