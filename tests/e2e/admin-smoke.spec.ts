import { test, expect } from '@playwright/test';

const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const importSecret = process.env.MINING_IMPORT_SECRET ?? 'dev-mining-secret';

test('admin auth entry, moderation queue load, approve/reject candidate', async ({ page, request }) => {
  await page.goto(`${baseUrl}/api/auth/signin`);
  await expect(page.getByText('Sign in')).toBeVisible();

  await request.post(`${baseUrl}/api/pipeline/import`, {
    headers: { authorization: `Bearer ${importSecret}` },
    data: {
      externalBatchId: 'e2e-batch-1',
      configVersion: 1,
      candidates: [
        {
          title: 'E2E Candidate',
          sourceUrl: 'https://example.test/e2e',
          sourcePlatform: 'web',
          fingerprint: 'e2efingerprint',
          confidenceScore: 0.61,
          signals: { source: 1 }
        }
      ]
    }
  });

  const queueBefore = await request.get(`${baseUrl}/api/admin/moderation/queue`);
  const beforeJson = await queueBefore.json();
  expect(Array.isArray(beforeJson.items)).toBe(true);

  if (beforeJson.items.length > 0) {
    const id = beforeJson.items[0].id;
    const approveRes = await request.post(`${baseUrl}/api/admin/moderation/${id}/approve`);
    expect(approveRes.ok()).toBe(true);
    const rejectRes = await request.post(`${baseUrl}/api/admin/moderation/${id}/reject`);
    expect(rejectRes.ok()).toBe(true);
  }

  await page.goto(`${baseUrl}/moderation`);
  await expect(page.getByText('Moderation')).toBeVisible();
});
