import { test, expect } from '@playwright/test';

test.describe('user tests', () => {
    test.use({
        storageState: async ({projectStorage}, use) => use(await projectStorage.get('admin')),
        // storageState: 'user',
    })
    
    test('verify user address', async ({ page }) => {
        await page.goto('/profile');
        await page.click('.address');
        await expect(page.locator('#street')).toHaveText([ 'John' ]);
    });    
})

test.describe('admin tests', () => {
    test.use({
        storageState: 'admin', // lookup in projectStorage first, then globalStorage, then file
        // storageState: '.storage/admin.json',
        // projectState: 'admin'
    })
    
    test('verify admin address', async ({ page }) => {
        await page.goto('/profile');
        await page.click('.address');
        await expect(page.locator('#street')).toHaveText([ 'John' ]);
    });    
})

test.describe('two users tests', () => {
    test('verify admin address', async ({ browser }) => {
        const adminContext = await browser.newContext({storageState: 'admin'});
        const adminPage = await adminContext.newPage();
        const userContext = await browser.newContext({storageState: 'user'});
        const userPage = await userContext.newPage();
    });    
})
