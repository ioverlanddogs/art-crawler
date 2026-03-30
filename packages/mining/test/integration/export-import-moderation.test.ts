import { describe, expect, test } from 'vitest';
import { buildExportPayload } from '../../src/lib/export';
import { listModerationCandidates, processImportBatch } from '../../../app/lib/pipeline/import-service';

function createFakePrisma() {
  const db = {
    candidates: [] as any[],
    telemetry: [] as any[],
    history: [] as any[],
    settingValue: 'false'
  };

  return {
    db,
    importBatch: {
      async upsert({ where }: any) {
        return { id: `batch-${where.externalBatchId}` };
      }
    },
    candidate: {
      async findUnique({ where }: any) {
        return db.candidates.find((x) => x.fingerprint === where.fingerprint) ?? null;
      },
      async create({ data }: any) {
        const item = { id: `cand-${db.candidates.length + 1}`, status: 'PENDING', createdAt: new Date(), ...data };
        db.candidates.push(item);
        return item;
      },
      async findMany() {
        return db.candidates.filter((x) => x.status === 'PENDING');
      }
    },
    confidenceHistory: {
      async create({ data }: any) {
        db.history.push(data);
      }
    },
    pipelineTelemetry: {
      async create({ data }: any) {
        db.telemetry.push(data);
      }
    },
    siteSetting: {
      async findUnique() {
        return { key: 'mining_import_enabled', value: db.settingValue };
      }
    }
  };
}

describe('mining export -> app import -> moderation visibility', () => {
  test('only visible when mining_import_enabled=true', async () => {
    const prisma = createFakePrisma();
    const payload = buildExportPayload(
      {
        sourceUrl: 'https://example.test/item-1',
        fingerprint: 'abc12345',
        confidenceScore: 0.8,
        configVersion: 7,
        normalizedJson: { title: 'Demo Candidate', platform: 'web' }
      },
      'batch-demo-1'
    );

    const imported = await processImportBatch(prisma, payload);
    expect(imported.inserted).toBe(1);

    prisma.db.settingValue = 'false';
    expect(await listModerationCandidates(prisma)).toEqual([]);

    prisma.db.settingValue = 'true';
    const queue = await listModerationCandidates(prisma);
    expect(queue).toHaveLength(1);
    expect(queue[0].title).toBe('Demo Candidate');
  });
});
