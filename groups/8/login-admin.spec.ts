import { test, expect } from '@playwright/test';

// 'login', 
test.globalSetup('login admin', async ({ page, context, browserName }) => {
  await page.goto('mydomain.com/login');
  await page.fill('#user', 'john');
  await page.fill('#password', 'qwerty');
  await context.storageState({path: `${browserName}.json`});
  // await saveSession();
  // await saveSession(await context.storageState());
});
