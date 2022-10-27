import { test, expect } from '@playwright/test';

test('login admin', async ({ page, context, storage }) => {
  await page.goto('mydomain.com/login');
  await page.fill('#user', 'john');
  await page.fill('#password', 'qwerty');
  await storage.set('admin', await context.storageState());
});

test('login user', async ({ page, context, storage }) => {
  await page.goto('mydomain.com/admin/login');
  await page.fill('#user', 'rey');
  await page.fill('#password', 'qwerty');
  await storage.set('user', await context.storageState());
});