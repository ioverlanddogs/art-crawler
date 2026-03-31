import { beforeEach, describe, expect, test, vi } from 'vitest';

const fetchSourceMock = vi.fn();
const extractFieldsMock = vi.fn();
const matchCanonicalMock = vi.fn();

vi.mock('@/lib/intake/fetch-source', () => ({
  fetchSource: fetchSourceMock
}));

vi.mock('@/lib/intake/extract-fields', () => ({
  extractFields: extractFieldsMock
}));

vi.mock('@/lib/intake/match-canonical', () => ({
  matchCanonical: matchCanonicalMock
}));

describe('runIntake', () => {
  const prismaMock = {
    sourceDocument: { create: vi.fn(), update: vi.fn() },
    ingestionJob: { create: vi.fn(), update: vi.fn() },
    extractionRun: { create: vi.fn() },
    proposedChangeSet: { create: vi.fn() }
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();

    prismaMock.sourceDocument.create.mockResolvedValue({ id: 'sd-1' });
    prismaMock.ingestionJob.create.mockResolvedValue({ id: 'job-1' });
    prismaMock.ingestionJob.update.mockResolvedValue({ id: 'job-1' });
    prismaMock.sourceDocument.update.mockResolvedValue({ id: 'sd-1' });
    prismaMock.extractionRun.create.mockResolvedValue({ id: 'er-1' });
    prismaMock.proposedChangeSet.create.mockResolvedValue({ id: 'pcs-1' });

    fetchSourceMock.mockResolvedValue({
      finalUrl: 'https://example.com/event',
      httpStatus: 200,
      contentType: 'text/html',
      rawHtml: '<html><title>Sample Event</title><body>Hello</body></html>',
      extractedText: 'Sample Event Hello',
      fetchedAt: new Date('2026-01-01T00:00:00.000Z')
    });
    extractFieldsMock.mockResolvedValue({
      extractedFieldsJson: { title: 'Sample Event' },
      confidenceJson: { title: 0.4 },
      evidenceJson: { title: [] },
      warningsJson: ['stub warning'],
      modelVersion: 'stub-v0',
      parserVersion: 'regex-v0'
    });
    matchCanonicalMock.mockResolvedValue({
      matchedEventId: null,
      matchType: 'none',
      diffJson: null
    });
  });

  test('happy path reaches needs_review and creates proposed change set', async () => {
    const { runIntake } = await import('@/lib/intake/intake-service');

    const result = await runIntake(
      prismaMock,
      { sourceUrl: 'https://example.com/event' },
      'user-1'
    );

    expect(result.finalStatus).toBe('needs_review');
    expect(result.proposedChangeSetId).toBe('pcs-1');
    expect(prismaMock.extractionRun.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.proposedChangeSet.create).toHaveBeenCalledTimes(1);
  });

  test('fetch failure marks job failed and skips extraction run creation', async () => {
    const { runIntake } = await import('@/lib/intake/intake-service');

    fetchSourceMock.mockResolvedValueOnce({
      finalUrl: 'https://example.com/event',
      httpStatus: 0,
      contentType: null,
      rawHtml: '',
      extractedText: '',
      fetchedAt: new Date('2026-01-01T00:00:00.000Z'),
      error: 'fetch_failed'
    });

    const result = await runIntake(prismaMock, { sourceUrl: 'https://example.com/event' }, 'user-1');

    expect(result.finalStatus).toBe('failed');
    expect(result.error).toBe('fetch_failed');
    expect(prismaMock.extractionRun.create).not.toHaveBeenCalled();
  });

  test('response_too_large uses the same failed flow and skips extraction', async () => {
    const { runIntake } = await import('@/lib/intake/intake-service');

    fetchSourceMock.mockResolvedValueOnce({
      finalUrl: 'https://example.com/event',
      httpStatus: 200,
      contentType: 'text/html',
      rawHtml: '',
      extractedText: '',
      fetchedAt: new Date('2026-01-01T00:00:00.000Z'),
      error: 'response_too_large'
    });

    const result = await runIntake(prismaMock, { sourceUrl: 'https://example.com/event' }, 'user-1');

    expect(result.finalStatus).toBe('failed');
    expect(result.error).toBe('response_too_large');
    expect(prismaMock.extractionRun.create).not.toHaveBeenCalled();
  });

  test('duplicate match sets matchedEventId on proposed change set', async () => {
    const { runIntake } = await import('@/lib/intake/intake-service');

    matchCanonicalMock.mockResolvedValueOnce({
      matchedEventId: 'evt-1',
      matchType: 'exact',
      diffJson: null
    });

    await runIntake(prismaMock, { sourceUrl: 'https://example.com/event' }, 'user-1');

    expect(prismaMock.proposedChangeSet.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ matchedEventId: 'evt-1' })
      })
    );
  });
});
