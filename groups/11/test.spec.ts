import { test, expect, storage, projectStorage, globalStorage } from '@playwright/test';

test.use({
    storageState: async ({}, use) => use(await projectStorage.get('admin') || await globalStorage.get('admin')),
    storageState: () => storage.get('admin'),
    storageStateName: 'admin',

    storageStateName: () => `test-user-${test.info().parallelIndex}`,
})

test('verify user address', async ({ page }) => {
    //projectStorage.get('admin') || globalStorage.get('admin');

    await page.goto('/profile');
    await page.click('.address');
    await expect(page.locator('#street')).toHaveText([ 'John' ]);
});    



test('verify user address', async ({ page }) => {
    //projectStorage.get('admin') || globalStorage.get('admin');

    await page.goto('/profile');
    await page.click('.address');
    await expect(page.locator('#street')).toHaveText([ 'John' ]);
});    
