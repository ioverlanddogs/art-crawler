import { describe, expect, test } from 'vitest';

type FieldReview = {
  fieldPath: string;
  decision: string | null;
};

function computeUnreviewedCount(
  fields: Array<{ fieldPath: string }>,
  fieldReviews: FieldReview[]
): number {
  return fields.filter(({ fieldPath }) => {
    const review = fieldReviews.find((r) => r.fieldPath === fieldPath);
    return !review || review.decision == null;
  }).length;
}

describe('computeUnreviewedCount', () => {
  test('all fields unreviewed returns full count', () => {
    const fields = [{ fieldPath: 'title' }, { fieldPath: 'startAt' }];
    expect(computeUnreviewedCount(fields, [])).toBe(2);
  });

  test('all fields reviewed returns 0', () => {
    const fields = [{ fieldPath: 'title' }, { fieldPath: 'startAt' }];
    const reviews: FieldReview[] = [
      { fieldPath: 'title', decision: 'accepted' },
      { fieldPath: 'startAt', decision: 'accepted' }
    ];
    expect(computeUnreviewedCount(fields, reviews)).toBe(0);
  });

  test('partial review returns remaining count', () => {
    const fields = [
      { fieldPath: 'title' },
      { fieldPath: 'startAt' },
      { fieldPath: 'description' }
    ];
    const reviews: FieldReview[] = [{ fieldPath: 'title', decision: 'accepted' }];
    expect(computeUnreviewedCount(fields, reviews)).toBe(2);
  });

  test('decision: null counts as unreviewed', () => {
    const fields = [{ fieldPath: 'title' }];
    const reviews: FieldReview[] = [{ fieldPath: 'title', decision: null }];
    expect(computeUnreviewedCount(fields, reviews)).toBe(1);
  });

  test('all decision values other than null count as reviewed', () => {
    const fields = [
      { fieldPath: 'a' }, { fieldPath: 'b' },
      { fieldPath: 'c' }, { fieldPath: 'd' }
    ];
    const reviews: FieldReview[] = [
      { fieldPath: 'a', decision: 'accepted' },
      { fieldPath: 'b', decision: 'rejected' },
      { fieldPath: 'c', decision: 'edited' },
      { fieldPath: 'd', decision: 'uncertain' }
    ];
    expect(computeUnreviewedCount(fields, reviews)).toBe(0);
  });
});

describe('safeFieldsResult.skipped null safety', () => {
  test('skipped undefined does not crash with optional chaining', () => {
    const safeFieldsResult: { updated: number; skipped?: Array<{ fieldPath: string; reason: string }> } = {
      updated: 3
    };
    const count = safeFieldsResult.skipped?.length ?? 0;
    expect(count).toBe(0);
  });

  test('skipped empty array produces empty string', () => {
    const safeFieldsResult = { updated: 3, skipped: [] as Array<{ fieldPath: string; reason: string }> };
    const suffix = (safeFieldsResult.skipped?.length ?? 0) > 0
      ? `; skipped ${safeFieldsResult.skipped.length}`
      : '';
    expect(suffix).toBe('');
  });

  test('skipped with items produces correct suffix', () => {
    const safeFieldsResult = {
      updated: 2,
      skipped: [{ fieldPath: 'description', reason: 'low confidence' }]
    };
    const suffix = (safeFieldsResult.skipped?.length ?? 0) > 0
      ? `; skipped ${safeFieldsResult.skipped.length} (${safeFieldsResult.skipped.map((item) => `${item.fieldPath}: ${item.reason}`).join(', ')})`
      : '';
    expect(suffix).toBe('; skipped 1 (description: low confidence)');
  });
});
