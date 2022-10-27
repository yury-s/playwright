import { test, expect } from '@playwright/test';

test.describe('user tests', () => {
    test.use({
        // storageState: ({browserName}, use) => use(`.storage/user-${browserName}.json`),
        storageState: 'user',
        // projectState: 'user'
    })
    
    test('verify user address', async ({ page }) => {
        await page.goto('/profile');
        await page.click('.address');
        await expect(page.locator('#street')).toHaveText([ 'John' ]);
    });    
})

test.describe('admin tests', () => {
    test.use({
        storageState: '.storage/admin.json',
        // projectState: 'admin'
    })
    
    test('verify admin address', async ({ page }) => {
        await page.goto('/profile');
        await page.click('.address');
        await expect(page.locator('#street')).toHaveText([ 'John' ]);
    });    
})
