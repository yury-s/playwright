/* eslint-disable notice/notice */

/**
 * In this script, we will login and run a few tests that use GitHub API.
 *
 * Steps summary
 * 1. Create a new repo.
 * 2. Run tests that programmatically create new issues.
 * 3. Delete the repo.
 */

import { test, expect } from '@playwright/test';

const user = 'test-account';
const orgName = 'Test-Org-1';

test.use({
  baseURL: 'https://api.mydomain.com',
  extraHTTPHeaders: {
    // Add authorization token to all requests.
    'Authorization': `token ${process.env.API_TOKEN}`,
  }
});

test.beforeAll(async ({ request }) => {
  // Create org
  const response = await request.post('/orgs/create', {
    data: {
      name: orgName
    }
  });
  expect(response.ok()).toBeTruthy();
});

test.afterAll(async ({ request }) => {
  // Delete repo
  const response = await request.delete(`/orgs/${user}/${orgName}`);
  expect(response.ok()).toBeTruthy();
});

test('should create bug report', async ({ request }) => {
  const newIssue = await request.post(`/orgs/${user}/${orgName}/issues`, {
    data: {
      title: '[Bug] report 1',
      body: 'Bug description',
    }
  });
  expect(newIssue.ok()).toBeTruthy();

  const issues = await request.get(`/orgs/${user}/${orgName}/issues`);
  expect(issues.ok()).toBeTruthy();
  expect(await issues.json()).toContainEqual(expect.objectContaining({
    title: '[Bug] report 1',
    body: 'Bug description'
  }));
});

test('should create feature request', async ({ request }) => {
  const newIssue = await request.post(`/orgs/${user}/${orgName}/issues`, {
    data: {
      title: '[Feature] request 1',
      body: 'Feature description',
    }
  });
  expect(newIssue.ok()).toBeTruthy();

  const issues = await request.get(`/orgs/${user}/${orgName}/issues`);
  expect(issues.ok()).toBeTruthy();
  expect(await issues.json()).toContainEqual(expect.objectContaining({
    title: '[Feature] request 1',
    body: 'Feature description'
  }));
});
