import { test, expect } from '@playwright/test';

const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const importSecret = process.env.MINING_SERVICE_SECRET ?? process.env.MINING_IMPORT_SECRET ?? 'dev-mining-secret';

test('admin auth entry, moderation queue load, approve/reject candidate', async ({ page, request }) => {
  await page.goto(`${baseUrl}/api/auth/signin`);
  await expect(page.getByText('Sign in')).toBeVisible();

  await request.post(`${baseUrl}/api/pipeline/import`, {
    headers: { authorization: `Bearer ${importSecret}` },
    data: {
      source: 'mining-service-v1',
      region: 'us',
      events: [
        {
          venueUrl: 'https://example.test/events',
          title: 'E2E Candidate',
          startAt: '2026-01-10T18:00:00.000Z',
          timezone: 'UTC',
          source: 'mining-service-v1',
          miningConfidenceScore: 61,
          observationCount: 2,
          sourceUrl: 'https://example.test/e2e'
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
