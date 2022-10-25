import { test, expect } from '@playwright/test';

test.describe.configure({
  // order: 20,
  concurrency: '20-teardown',
});

test('remove user', async ({ page }) => {
  await page.goto('mydomain.com/deleteUser');
  // await saveSession(await context.storageState());
});

