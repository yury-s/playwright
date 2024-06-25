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

import { devices } from '@playwright/test';
import { contextTest as it, expect } from '../config/browserTest';
import type { ElementHandle } from 'playwright-core';

// it.use({ hasTouch: true });
it.use({
  ...devices['iPhone 12'],
});

async function swipe(page, locator, direction: 'up' | 'down' | 'left' | 'right') {
  const box = await locator.boundingBox();
  // await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  console.log('box', box);
  let xDistance = 0;
  let yDistance = 0;
  switch (direction) {
    case 'up':
      yDistance = -100;
      break;
    case 'down':
      yDistance = 100;
      break;
    case 'left':
      xDistance = -100;
      break;
    case 'right':
      xDistance = 100;
      break;
  }
  console.log('swipe', x, y, xDistance, yDistance);
  return page.touchscreen.swipe(x, y, xDistance, yDistance, { steps: 3 });
}

it('list swipe out', async ({ page }) => {
  await page.goto('https://davidgaroro.github.io/vuetify-swipeout/');
  await page.getByText('1 - Swipe me to right').swipe('right');
  await page.getByText('2 - Swipe me to right').swipe('right');
  await page.getByText('3 - Swipe me to right').swipe('right');
  await page.getByText('4 - Swipe me to right').swipe('right');

  await page.getByText('Swipe me to left - 5').swipe('left');
  await page.getByText('Swipe me to left - 6').swipe('left');
  await page.getByText('Swipe me to left - 7').swipe('left');
  await page.getByText('Swipe me to left - 8').swipe('left');
  await expect(page.getByText('Swipe me to left - 8')).not.toBeVisible();
});

it('should send all of the correct events @smoke', async ({ page }) => {
  await page.setContent(`
  <div id="a" style="background: lightblue; width: 200px; height: 50px">a</div>
  <div id="b" style="background: pink; width: 200px; height: 50px">b</div>
`);
  await page.locator('#a').swipe('right');
  const eventsHandle = await trackEvents(await page.$('#b'));
  await page.locator('#b').swipe('left');
  console.log('events', await eventsHandle.jsonValue());
  // webkit doesn't send pointerenter or pointerleave or mouseout
  expect(await eventsHandle.jsonValue()).toEqual([
    'pointerover',  'pointerenter',
    'pointerdown',  'touchstart',
    'pointerup',    'pointerout',
    'pointerleave', 'touchend',
    'mouseover',    'mouseenter',
    'mousemove',    'mousedown',
    'mouseup',      'click',
  ]);
  // await new Promise(() => {});
});

it('drawer menu', async ({ page }) => {
  await page.goto('https://mui.com/material-ui/react-drawer/#swipeable');
  // await page.getByRole('button', { name: 'right' }).nth(1).click();
  await page.getByRole('button', { name: 'top' }).nth(1).click();

  await new Promise(f => setTimeout(f, 1000));
  // await swipe(page, page.locator('div:nth-child(9) > .MuiPaper-root'), 'up');
  await swipe(page, page.getByRole('button', { name: 'Spam' }), 'up');
  //await page.getByRole('button', { name: 'Spam' }).tap();
  await new Promise(f => setTimeout(f, 1000));

  // await page.getByRole('button', { name: 'Spam' }).click();
  // await page.getByRole('button', { name: 'top' }).nth(1).click();
  // await page.getByRole('button', { name: 'Spam' }).click();
  await new Promise(() => {});
});

it('test scrollview', async ({ page }) => {
  await page.goto('https://demo.mobiscroll.com/fullscreen/scrollview/paging');
  await page.evaluate(() => {
    window.addEventListener('mousemove', e => console.log('mousemove', e));
    window.addEventListener('touchstart', e => {
      console.log('touchstart', e);
      e.preventDefault();
      e.stopPropagation();
    }, true);
  });
  // await page.getByText('Meghan Trainor Featuring John').tap();
  await swipe(page, page.getByText('Hotline Bling Drake'), 'up');
  await new Promise(f => setTimeout(f, 1000));
  await swipe(page, page.getByText('The Fix Nelly Featuring Jeremih'), 'down');
  await new Promise(f => setTimeout(f, 1000));
  await swipe(page, page.getByText('Hotline Bling Drake'), 'left');
  await new Promise(f => setTimeout(f, 1000));
  await swipe(page, page.getByText('Adventure Of A Lifetime Coldplay'), 'left');
  await new Promise(f => setTimeout(f, 1000));
  await page.getByRole('button', { name: 'Piano' }).tap();
  await new Promise(f => setTimeout(f, 1000));
  await swipe(page, page.getByRole('heading', { name: 'Sonata in B Minor' }), 'up');
  // await page.getByText('Hotline Bling Drake').click();
  // await page.getByText('What Do You Mean? Justin').click();
  // await page.getByText('The Hills The Weeknd').click();
  // await page.getByRole('button', { name: 'Electric' }).click();
  // await page.getByText('Adventure Of A Lifetime Coldplay').click();
  // await page.getByRole('button', { name: 'Piano' }).click();
  // await page.getByRole('heading', { name: 'Sonata in B Minor' }).click();
  await new Promise(() => {});
});

it('should scroll', async ({ page }) => {
  await page.goto('https://yury-s.github.io/yury-s/');

  const box = await page.getByText('Touch').boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);

  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  for (let i = 0; i < 10; i++) {
  console.log('will swipe ' + i);
  await new Promise(f => setTimeout(f, 100));
  await page.touchscreen.swipe(x, y, 0, -100);
  await new Promise(f => setTimeout(f, 100));
  console.log('will swipe ' + i);
  await page.touchscreen.swipe(x, y, 0, +100);
  }

  await page.locator('#touchBox').evaluate((e: HTMLElement) => {
    e.setAttribute('style', 'overflow: scroll');
    e.innerHTML = '<div style="height: 1000px;">aaa</div>bbb';
  });
  {
    const box = await page.locator('#touchBox').boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);

    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await new Promise(f => setTimeout(f, 100));
    await page.touchscreen.swipe(x, y, 0, 30);
    await new Promise(f => setTimeout(f, 100));
  }
  await page.touchscreen.swipe(x, 500, 0, 30);

  // await page.frameLocator('iframe >> nth=0').getByRole('button', { name: 'menu' }).click();
  // await page.frameLocator('iframe >> nth=0').locator('ion-content').filter({ hasText: 'This is the menu content.' }).locator('div').nth(1).click();
  // await page.frameLocator('iframe >> nth=0').locator('ion-content').filter({ hasText: 'This is the menu content.' }).locator('div').nth(1).click();
  // await page.frameLocator('iframe >> nth=0').getByRole('navigation', { name: 'menu' }).press('Escape');
  await new Promise(() => {});
});



it('should drag', async ({ page }) => {
  await page.goto('https://action.parabol.co/retrospective-demo/group');
  await page.getByRole('button', { name: 'Start Demo' }).click();
  await page.getByTestId('CloseIcon').locator('path').click();
  await page.locator('div:nth-child(2) > .css-79elbk > .css-lzmwbu > .css-ehba41 > .css-1rp8ak > .css-1lrmk73 > .DraftEditor-root > .DraftEditor-editorContainer > .public-DraftEditor-content').click();
  await page.getByRole('button', { name: 'End Demo' }).click();
  await page.getByRole('button', { name: 'End Demo' }).click();
  await page.goto('https://action.parabol.co/retrospective-demo/group');
  await page.locator('.css-1f4e5o4').first().click();
  await page.locator('div:nth-child(2) > .css-79elbk > .css-lzmwbu > .css-ehba41 > .css-1rp8ak > .css-1lrmk73 > .DraftEditor-root > .DraftEditor-editorContainer > .public-DraftEditor-content').first().click();
  await page.locator('.css-0 > .css-1rp8ak > .css-1lrmk73 > .DraftEditor-root > .DraftEditor-editorContainer > .public-DraftEditor-content').click();
  await page.locator('.css-1f4e5o4').first().click();
  await page.locator('.css-1f4e5o4').first().click();
  await page.locator('.css-1f4e5o4').first().click();
  await page.locator('.css-1f4e5o4').first().click();
  await page.locator('.css-k2emfd > .css-1f4e5o4').click();

  for (let i = 0; i < 100; i++) {
  console.log('will swipe ' + i);
  await new Promise(f => setTimeout(f, 500));
  await page.touchscreen.swipe(200, 400, -100, 0);
  await new Promise(f => setTimeout(f, 500));
  console.log('will swipe ' + i);
  await page.touchscreen.swipe(200, 400, +100, 0);
  }

  // await page.frameLocator('iframe >> nth=0').getByRole('button', { name: 'menu' }).click();
  // await page.frameLocator('iframe >> nth=0').locator('ion-content').filter({ hasText: 'This is the menu content.' }).locator('div').nth(1).click();
  // await page.frameLocator('iframe >> nth=0').locator('ion-content').filter({ hasText: 'This is the menu content.' }).locator('div').nth(1).click();
  // await page.frameLocator('iframe >> nth=0').getByRole('navigation', { name: 'menu' }).press('Escape');
  await new Promise(() => {});
});


it('should check the box @smoke', async ({ page }) => {
  await page.goto('https://ionicframework.com/docs/api/menu#basic-usage');
  {
    const box = await page.frameLocator('iframe >> nth=0').getByRole('button', { name: 'menu' }).boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  }
  {
    const box = await page.frameLocator('iframe >> nth=0').locator('ion-content').filter({ hasText: 'This is the menu content.' }).locator('div').nth(1).boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  }
  {
    await new Promise(f => setTimeout(f, 500));
    const box = await page.frameLocator('iframe >> nth=0').locator('ion-content').filter({ hasText: 'This is the menu content.' }).boundingBox();

    console.log('box', box);
    await page.touchscreen.swipe(200, 400, -100, 0);

  }

  // await page.frameLocator('iframe >> nth=0').getByRole('button', { name: 'menu' }).click();
  // await page.frameLocator('iframe >> nth=0').locator('ion-content').filter({ hasText: 'This is the menu content.' }).locator('div').nth(1).click();
  // await page.frameLocator('iframe >> nth=0').locator('ion-content').filter({ hasText: 'This is the menu content.' }).locator('div').nth(1).click();
  // await page.frameLocator('iframe >> nth=0').getByRole('navigation', { name: 'menu' }).press('Escape');
  await new Promise(() => {});
});


async function trackEvents(target: ElementHandle) {
  const eventsHandle = await target.evaluateHandle(target => {
    const events: string[] = [];
    for (const event of [
      'mousedown', 'mouseenter', 'mouseleave', 'mousemove', 'mouseout', 'mouseover', 'mouseup', 'click',
      'pointercancel', 'pointerdown', 'pointerenter', 'pointerleave', 'pointermove', 'pointerout', 'pointerover', 'pointerup',
      'touchstart', 'touchend', 'touchmove', 'touchcancel',
    ])
      target.addEventListener(event, () => events.push(event), false);
    return events;
  });
  return eventsHandle;
}

