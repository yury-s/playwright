/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { PlaywrightTestConfig } from '@playwright/experimental-ct-react';
import { devices } from '@playwright/experimental-ct-react';

const config: PlaywrightTestConfig = {
  testDir: 'src',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  globalSetupMatch: ['**/create-accounts.spec.ts'],
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop chromium admin console',
      projectSetup: ['login-admin.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'desktop chromium user activity history',
      // unclear which project to use?
      // globalSetup: ['**/create-accounts.spec.ts'],
      projectSetup: ['login-user.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'desktop chromium new account',
      projectSetup: ['create-merchant-catalogue.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
};

export default config;
