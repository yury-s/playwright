import { test, expect } from '@playwright/test';

test.globalSetup('login user', async ({ page, context, browserName }) => {
  await page.goto('mydomain.com/admin/login');
  await page.fill('#user', 'rey');
  await page.fill('#password', 'qwerty');
  await context.storageState({path: `${browserName}.json`});
  // await saveSession();
  // await saveSession(await context.storageState());
});