import { setup, expect, storage } from '@playwright/test';

setup('login admin', async ({ page, context }) => {
  await page.goto('mydomain.com/login');
  await page.fill('#user', 'john');
  await page.fill('#password', 'qwerty');
  await storage.set('admin', await context.storageState());
});
