import { test, expect } from '@playwright/test';


async function login(page, browserName, user, password) {
    await page.goto('mydomain.com/login');
    await page.fill('#user', user);
    await page.fill('#password', password);
    await page.click('#submit');
}

export async function loginAsAdmin(page, browserName) {
    await login(page, browserName, 'rey', 'qwerty');
}

export async function loginAsUser(page, browserName) {
    await login(page, browserName, 'john', 'qwerty');
}

export async function populateUserProfile(page, browserName) {
}
