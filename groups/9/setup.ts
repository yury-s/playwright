import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginAsUser } from './global-fixtures';

test.use({
    storageState: undefined
})

test.beforeEach(() => {
});

test.globalSetUp(async ({page, browserName}) => {
    await loginAsUser(page, browserName);
    await loginAsAdmin(page, browserName);
});

test.projectSetUp(async ({page, browserName}) => {
    await populateUserProfile(page, browserName);
});

