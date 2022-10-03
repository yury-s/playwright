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
import { group } from 'console';


const stages = {
  GLOBAL_SETUP: {
    order: -20,
    workers: 1,
    stopOnFailures: true,
  },
  SMOKE_TESTS: {
    order: -10,
    fullyParallel: true,
    stopOnFailures: true,
  }
};

const setup = {
  order: -10,
  workers: 1,
  stopOnFailures: true,
};
const smokeTests = {
  order: -10,
  workers: 1,
  stopOnFailures: true,
};

const config: PlaywrightTestConfig = {
  testDir: 'src',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    ctPort: 3102,
    trace: 'on-first-retry',
  },
  // Defaults:
  //   stage: 0
  //   runAlways: false
  //   stopOnFailure: false
  //
  // runAlways is redundant - can be solved by running --project=setup,smoke,teardown instead
  // stage aka order, phase, ...
  // workers - later, per project?
  // 
  projects: [
    {
      name: 'setup-login',
      testMatch: '**/*setup-login.ts',
      ...stages.GLOBAL_SETUP,
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'setup-db',
      testMatch: '**/*setup-db.ts',
      ...stages.GLOBAL_SETUP,
      stage: -30,
      canShard: false,  // noshard, runInEachShard
      stopOnFailure: true,
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'setup',
      testMatch: '**/*setup.ts',
      stage: -20,
      runAlways: true, // ==> shards = false, 
      stopOnFailure: true,
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'desktop chromium @smoke',
      stage: -10,
      stopOnFailure: true,
      grep: /@smoke/,
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'desktop chromium',
      grepInvert: /@smoke/,
      stage: 20,
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'mobile chromium',
      grepInvert: /@smoke/,
      stage: 20,
      use: {
        ...devices['Pixel 6'],
      },
    },
    {
      name: 'desktop webkit',
      grepInvert: /@smoke/,
      use: {
        ...devices['Desktop WebKit'],
      },
    },
    {
      name: 'teardown',
      testMatch: '**/*teardown.ts',
      stage: 100,
      canShard: false,
      runAlways: true,
      // runAfterFailuresToo: true,
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
  stages: {
    'setup': {
      order: -10,
      workers: 1,
      stopOnFailures: true,
    },
    'smokeTests': {
      order: -10,
      workers: 1,
      stopOnFailures: true,
    }
  }
};

export default config;
