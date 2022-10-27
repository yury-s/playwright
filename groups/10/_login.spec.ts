import { test, expect } from '@playwright/test';

test('login admin', async ({ page, context, browserName, projectStorage }) => {
  await page.goto('mydomain.com/login');
  await page.fill('#user', 'john');
  await page.fill('#password', 'qwerty');
  await projectStorage.set('admin', context.storageState());
});

test('login user', async ({ page, context, browserName }) => {
  await page.goto('mydomain.com/admin/login');
  await page.fill('#user', 'rey');
  await page.fill('#password', 'qwerty');
  await context.storageState({path: `.storage/user-${browserName}.json`});
});