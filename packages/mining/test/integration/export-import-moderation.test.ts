import { describe, expect, test } from 'vitest';
import { processImportBatch } from '../../../app/lib/pipeline/import-service.js';

function createFakePrisma(settingValue: 'true' | 'false') {
  const db = {
    events: [] as any[],
    batches: [] as any[]
  };

  return {
    db,
    siteSetting: {
      async findUnique() {
        return { key: 'mining_import_enabled', value: settingValue };
      }
    },
    importBatch: {
      async create({ data }: any) {
        const row = { id: `batch-${db.batches.length + 1}`, ...data };
        db.batches.push(row);
        return row;
      },
      async update() {
        return {};
      }
    },
    venueProfile: {
      async upsert() {
        return {};
      }
    },
    ingestExtractedEvent: {
      async findUnique() {
        return null;
      },
      async create({ data }: any) {
        db.events.push(data);
        return data;
      }
    }
  } as any;
}

const payload = {
  source: 'mining-service-v1',
  region: 'us',
  events: [
    {
      venueUrl: 'https://example.test/events',
      title: 'Demo Candidate',
      startAt: '2026-01-10T18:00:00.000Z',
      timezone: 'UTC',
      source: 'mining-service-v1',
      miningConfidenceScore: 91,
      observationCount: 4
    }
  ]
};

describe('mining export -> app import moderation visibility gate', () => {
  test('suppresses candidate creation when mining_import_enabled=false', async () => {
    const prisma = createFakePrisma('false');
    const result = await processImportBatch(prisma, payload);

    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
    expect(prisma.db.events).toHaveLength(0);
  });

  test('creates moderation candidate when mining_import_enabled=true', async () => {
    const prisma = createFakePrisma('true');
    const result = await processImportBatch(prisma, payload);

    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
    expect(prisma.db.events).toHaveLength(1);
    expect(prisma.db.events[0].title).toBe('Demo Candidate');
  });
});
