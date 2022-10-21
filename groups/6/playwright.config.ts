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
 
 const config: PlaywrightTestConfig = {
   testDir: 'src',
   forbidOnly: !!process.env.CI,
   retries: process.env.CI ? 2 : 0,
   reporter: 'html',
   use: {
     ctPort: 3102,
     trace: 'on-first-retry',
   },
   projects: [
     {
       name: 'desktop chromium',
       group: { name: 'foo', order: 10 },
       use: {
         ...devices['Desktop Chrome'],
       },
     },
     {
       name: 'mobile chromium',
       group: { name: 'foo' },
       use: {
         ...devices['Pixel 6'],
       },
     },
     {
      name: 'desktop webkit',
      group: { name: 'bar', order: 10, worker: 1 },
      use: {
        ...devices['Desktop WebKit'],
      },
    },
    {
      name: 'sequential files project',
      workers: 1,
      testMatch: 'tests/seq/*.spec.ts',
      use: {
        ...devices['Pixel 6'],
      },
    },
 ],
 };
 
 export default config;
 