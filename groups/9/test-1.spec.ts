import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginAsUser } from './global-fixtures';

test.globalSetUp(async ({page, browserName}) => {
    await loginAsUser(page, browserName);
    await loginAsAdmin(page, browserName);
});

test.projectSetUp(async ({page, browserName}) => {
    await populateUserProfile(page, browserName);
});


test.describe(() => {
    test('verify user', async ({ page }) => {
        await page.goto('/profile');
        await expect(page.locator('.user')).toHaveText(['John']);
    });
});

test.describe.configure({
    mode: 'parallel'
});

test('verify user address', async ({ page }) => {
    await page.goto('/profile');
    await page.click('.address');
    await expect(page.locator('#street')).toHaveText(['John']);
});    
