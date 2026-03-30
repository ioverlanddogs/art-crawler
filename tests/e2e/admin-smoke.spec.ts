import { test, expect } from '@playwright/test';

test('home loads', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await expect(page.getByText('Go to admin')).toBeVisible();
});
