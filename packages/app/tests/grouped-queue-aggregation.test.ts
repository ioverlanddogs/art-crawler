import { describe, expect, test } from 'vitest';
import { analyseBatchUrls, groupByKey } from '@/lib/admin/batch-workflows';

describe('grouped queue aggregation', () => {
  test('groups rows and sorts by descending count', () => {
    const grouped = groupByKey(
      [
        { id: '1', status: 'draft' },
        { id: '2', status: 'approved' },
        { id: '3', status: 'draft' }
      ],
      (row) => row.status
    );

    expect(grouped.map((row) => [row.key, row.count])).toEqual([
      ['draft', 2],
      ['approved', 1]
    ]);
  });

  test('computes intake URL analysis for duplicates and invalid entries', () => {
    const analysis = analyseBatchUrls(
      ['https://a.example/1', 'https://a.example/1', 'invalid', 'https://b.example/image.png'],
      ['https://c.example/1']
    );

    expect(analysis.validUrls).toEqual(['https://a.example/1', 'https://b.example/image.png']);
    expect(analysis.duplicateUrls).toEqual(['https://a.example/1']);
    expect(analysis.invalidUrls).toEqual(['invalid']);
    expect(analysis.formatWarnings).toEqual(['https://b.example/image.png']);
    expect(analysis.estimatedCandidateYield).toBe(1);
  });
});
