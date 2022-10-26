import { test, expect } from '@playwright/test';

test('verify user', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.locator('.user')).toHaveText([ 'John' ]);
});    

test('verify user address', async ({ page }) => {
    await page.goto('/profile');
    await page.click('.address');
    await expect(page.locator('#street')).toHaveText([ 'John' ]);
});    
