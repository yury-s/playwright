import { test, expect } from '@playwright/test';

test.describe.configure({
    criticalSection: 'user-account-changes',
    orderInsideCriticalSection: 10,
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
