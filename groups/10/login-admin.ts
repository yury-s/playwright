import { test, expect } from '@playwright/test';

type Storage = {
  get<T>(name: string): Promise<T>;
  set<T>(name: string, value: T): Promise<void>;
}

test('login admin', async ({ page, context, storage }) => {
  // if (await storage.has('admin'))
  //   return;
  await page.goto('mydomain.com/login');
  await page.fill('#user', 'john');
  await page.fill('#password', 'qwerty');
  await storage.set('admin', await context.storageState());
  // await storage.set('admin', await context.storageState(), {cache: true});
});
