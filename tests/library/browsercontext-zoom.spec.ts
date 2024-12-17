/**
 * Copyright 2018 Google Inc. All rights reserved.
 * Modifications copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { contextTest as test, expect } from '../config/browserTest';
import { verifyViewport } from '../config/utils';
import type { Page } from '@playwright/test';

test.use({
  deviceScaleFactor: 3,
});

test('should set the proper viewport size', async ({ page, server }) => {
  await verifyViewport(page, 1280, 720);
  await page.setViewportSize({ width: 345, height: 456 });
  await verifyViewport(page, 345, 456);
});

async function getSize(page: Page) {
  return await page.evaluate(() => {
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      outerWidth: window.outerWidth,
      outerHeight: window.outerHeight,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      visualViewportWidth: window.visualViewport.width,
      visualViewportHeight: window.visualViewport.height,
      dpr: window.devicePixelRatio,
    };
  });
}

test('should return correct outerWidth and outerHeight', async ({ page, server }) => {
  await page.setViewportSize({ width: 900, height: 600 });
  await page.goto(server.PREFIX + '/grid.html');
  console.log('size before zoom', await getSize(page));
  await new Promise(f => setTimeout(f, 5000));
  await page.setZoom(1.5);
  console.log('size after zoom', await getSize(page));
  const size = await getSize(page);
  await new Promise(f => setTimeout(f, 5000));
  expect(size.innerWidth).toBe(600);
  expect(size.innerHeight).toBe(400);
  await expect(page).toHaveScreenshot({ scale: 'device' });
  // expect(size.outerWidth >= size.innerWidth).toBeTruthy();
  // expect(size.outerHeight >= size.innerHeight).toBeTruthy();
});


test('should change bg', async ({ page, server }) => {
  await page.setViewportSize({ width: 900, height: 600 });
  await page.goto('file:///Users/yurys/playwright/dpr.html');
  console.log('size before zoom', await getSize(page));
  await expect.soft(page).toHaveScreenshot({ scale: 'device' });
  await new Promise(f => setTimeout(f, 2000));
  // cmd_fullZoomEnlarge
  // FullZoom.enlarge();
  // ZoomManager.MAX
  await page.setZoom(1.5);
  console.log('size after zoom 1.5', await getSize(page));
  await expect.soft(page).toHaveScreenshot({ scale: 'device' });
  await new Promise(f => setTimeout(f, 2000));
  console.log('will set zoom 2');
  await page.setZoom(2);
  console.log('did set zoom 2');
  console.log('size after zoom 2', await getSize(page));
  await expect.soft(page).toHaveScreenshot({ scale: 'device' });
  await new Promise(f => setTimeout(f, 2000));
  console.log('will set zoom 0.5');
  await page.setZoom(0.5);
  console.log('did set zoom 0.5');
  console.log('size after zoom 0.5', await getSize(page));
  await expect.soft(page).toHaveScreenshot({ scale: 'device' });
  await new Promise(f => setTimeout(f, 3000));
});
