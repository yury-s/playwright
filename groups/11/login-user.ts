import test, { test as setup } from '@playwright/test';

setup('login user', async ({ page, context, storage }) => {
  await page.goto('mydomain.com/admin/login');
  await page.fill('#user', 'rey');
  await page.fill('#password', 'qwerty');
  await storage.set('user', await context.storageState());
});