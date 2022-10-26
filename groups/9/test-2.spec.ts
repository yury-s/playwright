import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginAsUser } from './global-fixtures';

test.globalSetUp(async ({page, browserName}) => {
    await loginAsUser(page, browserName);
    await loginAsAdmin(page, browserName);
});

test.projectSetUp(async ({page, browserName}) => {
    await populateUserProfile(page, browserName);
});

test.globalTearDown('remove user', async ({ page }) => {
    await page.goto('mydomain.com/deleteUser');
    // await saveSession(await context.storageState());
  });
  

test('export profile', async ({ page }) => {
    await page.goto('/profile');
    await page.getByTestId('export-profile').click();
});

test('verify user address', async ({ page }) => {
    await page.goto('/profile');
    await page.click('.address');
    await expect(page.locator('#street')).toHaveText(['John']);
});    
