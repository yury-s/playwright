import { test, expect } from '@playwright/test';

test('remove user', async ({ page }) => {
  await page.goto('mydomain.com/deleteUser');
  // await saveSession(await context.storageState());
});

