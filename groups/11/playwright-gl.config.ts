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
  use: {
    // storageState: 'default',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'global setup',
      globalSetup: true,
      // storageState: undefined, // ??
      testMatch: ['.*login-all.spec.ts'],
    },
    {
      name: 'desktop chromium console',
      use: {
        storageState: 'user',
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'desktop chromium user activity history',
      use: {
        storageState: 'user',
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'desktop chromium new account',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
};

export default config;
