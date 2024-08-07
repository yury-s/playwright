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

import { contextTest as it, expect } from '../config/browserTest';
import type { Locator } from 'playwright-core';

it.use({ hasTouch: true });

it.fixme(({ browserName }) => browserName === 'firefox');

it('generate touch events', async ({ page, server }) => {
  await page.goto(server.PREFIX + '/touch-log.html');
  const center1 = await centerPoint(page.locator('#t1'));
  const center2 = await centerPoint(page.locator('#t2'));

  const p1 = { ...center1, id: 11 };
  const p2 = { ...center1, id: 12 };
  const p3 = { ...center2, id: 21 };
  const p4 = { ...center2, id: 22 };

  async function takeLog() {
    const log = await page.evaluate(() => {
      const events = (window as any).touchEvents;
      (window as any).touchEvents = [];
      return events;
    });
    return JSON.stringify(log, null, 2);
  }

  await page.touchscreen.touch('touchstart', [p1]);
  console.log(await takeLog());
  p1.x += 20;
  await page.touchscreen.touch('touchmove', [p1]);
  await page.touchscreen.touch('touchstart', [p1, p2]);
  // console.log(await takeLog());
  p1.y += 20;
  p2.y += 20;
  await page.touchscreen.touch('touchmove', [p1, p2]);

  await page.touchscreen.touch('touchstart', [p1, p2, p3]);
  p1.y -= 40;
  p3.y += 30;
  await page.touchscreen.touch('touchmove', [p1, p2, p3]);


  await page.touchscreen.touch('touchstart', [p1, p2, p3, p4]);
  p4.x += 20;
  await page.touchscreen.touch('touchmove', [p1, p2, p3, p4]);

  // await new Promise(() => {});
});


it('slow swipe events @smoke', async ({ page }) => {
  it.fixme();
  await page.setContent(`<div id="a" style="background: lightblue; width: 200px; height: 200px">a</div>`);
  const eventsHandle = await trackEvents(await page.locator('#a'));
  const center = await centerPoint(page.locator('#a'));
  await page.touchscreen.touch('touchstart', [{ ...center, id: 1 }]);
  expect.soft(await eventsHandle.jsonValue()).toEqual([
    'pointerover',
    'pointerenter',
    'pointerdown',
    'touchstart',
  ]);

  await eventsHandle.evaluate(events => events.length = 0);
  await page.touchscreen.touch('touchmove', [{ x: center.x + 10, y: center.y + 10, id: 1 }]);
  await page.touchscreen.touch('touchmove', [{ x: center.x + 20, y: center.y + 20, id: 1 }]);
  expect.soft(await eventsHandle.jsonValue()).toEqual([
    'pointermove',
    'touchmove',
    'pointermove',
    'touchmove',
  ]);

  await eventsHandle.evaluate(events => events.length = 0);
  await page.touchscreen.touch('touchend', [{ x: center.x + 20, y: center.y + 20, id: 1 }]);
  expect.soft(await eventsHandle.jsonValue()).toEqual([
    'pointerup',
    'pointerout',
    'pointerleave',
    'touchend',
  ]);
});

async function logTouchEvents(page) {
  await page.evaluate(() => {
  });
  const eventsHandle = await target.evaluateHandle(target => {
    const events: string[] = [];
    for (const event of [
      'mousedown', 'mouseenter', 'mouseleave', 'mousemove', 'mouseout', 'mouseover', 'mouseup', 'click',
      'pointercancel', 'pointerdown', 'pointerenter', 'pointerleave', 'pointermove', 'pointerout', 'pointerover', 'pointerup',
      'touchstart', 'touchend', 'touchmove', 'touchcancel',])
      target.addEventListener(event, () => events.push(event), { passive: false });
    return events;
  });
  return eventsHandle;
}




async function trackEvents(target: Locator) {
  const eventsHandle = await target.evaluateHandle(target => {
    const events: string[] = [];
    for (const event of [
      'mousedown', 'mouseenter', 'mouseleave', 'mousemove', 'mouseout', 'mouseover', 'mouseup', 'click',
      'pointercancel', 'pointerdown', 'pointerenter', 'pointerleave', 'pointermove', 'pointerout', 'pointerover', 'pointerup',
      'touchstart', 'touchend', 'touchmove', 'touchcancel',])
      target.addEventListener(event, () => events.push(event), { passive: false });
    return events;
  });
  return eventsHandle;
}

async function centerPoint(e: Locator) {
  const box = await e.boundingBox();
  if (!box)
    throw new Error('Element is not visible');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}