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
  testExecutionTracks: [
    [
      '.*login.*.spec.ts',
      '.*profile.*.spec.ts',
    ],
    [
      '.*orders.*.spec.ts',
      '.*deliveries.*.spec.ts',
    ],
    [
      {workers: 1},
      '.*update-address.*.spec.ts',
      '.*update-phone.*.spec.ts',
      '.*update-employer.*.spec.ts',
    ]
  ],

  implicit: {
    mode: 'serial',
    items: [
      'setup',
      'schedule'
    ]
  },


  schedule: {
    mode: 'parallel',
    items: [
      {
        mode: 'critical section',
        items: [
          { testMatch: 'special/*', use: devices['Desktop Chrome'] },
          { testMatch: 'special/*', use: devices['Desktop Firefox'] },
          { testMatch: 'special/*', use: devices['Desktop WebKit'] },
          // { file: 'special/*', project: 'chromium' },
          // { file: 'special/*', project: 'webkit' },
          // { file: 'special/*', project: 'firefox' },
        ],
      },
      {
        mode: 'parallel',
        items: [
          { file: 'regular/*', project: 'chromium' },
          { file: 'regular/*', project: 'webkit' },
          { file: 'regular/*', project: 'firefox' },
        ],
      },
    ]
  },


  schedule: {
    mode: 'parallel',
    items: [
      {
        mode: 'critical section',
        items: [
          { testMatch: 'special/*' },
        ],
      },
      {
        mode: 'parallel',
        items: [
          { file: 'regular/*' },
        ],
      },
    ]
  },


  projects: [
    {
      name: 'desktop chromium admin console',
      setup: ['setup.ts'],
      testMatch: [ ],
      // testOrder: 'testmatch' | 'alphabetical',
      testOrder: [
        { pattern: '.*login.*.spec.ts', mode: 'parallel' | 'sequential' },
        '.*profile.*.spec.ts',
      ],
      testOrder: [[
        '.*login.*.spec.ts',
        '.*profile.*.spec.ts',
      ], [
        '.*orders.*.spec.ts',
        '.*deliveries.*.spec.ts',
      ]],
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'desktop chromium user activity history',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'desktop chromium new account',
      setup: ['setup.ts', 'create-merchant-catalogue.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
};

export default config;
