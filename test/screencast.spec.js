/**
 * Copyright Microsoft Corporation. All rights reserved.
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

const fs = require('fs');
const os = require('os');
const path = require('path');
const url = require('url');
const {mkdtempAsync, removeFolderAsync} = require('./utils');

const {FFOX, CHROMIUM, HEADLESS} = testOptions;

registerFixture('persistentDirectory', async ({}, test) => {
  const persistentDirectory = await mkdtempAsync(path.join(os.tmpdir(), 'playwright-test-'));
  try {
    await test(persistentDirectory);
  } finally {
    await removeFolderAsync(persistentDirectory);
  }
});

it('should respect dpr', async({browser, server}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.setViewportSize({width: 640, height: 480})
  console.log('\n\nwill start screecast\n\n');
  await page._delegate.startVideoRecording({outputFile: 'v.webm', width: 840, height: 480, scale: 0.8});
  await page.goto(server.PREFIX + '/grid.html');

  // await (await context.newPage()).goto(server.PREFIX + '/animation.html');
  await page.goto(server.PREFIX + '/animation.html');
  // await page.goto(server.PREFIX + '/poster-circle.html');
  await new Promise(r => setTimeout(r, 500));
  await page.setViewportSize({width: 640, height: 880})
  await new Promise(r => setTimeout(r, 500));
  // await page.screenshot({type: 'png', path: 'screenshot.png', clip: {x: 0, y: 0, width: 1280, height: 720}});
  await page._delegate.stopVideoRecording();
  console.log('Did stop screencast');
});

it.fail(CHROMIUM)('should capture static page', async({page, persistentDirectory}) => {
  console.log('\n\nwill start screecast\n\n');
  // const videoFile = '/home/yurys/playwright/v.webm';
  const videoFile = path.join(persistentDirectory, 'v.webm');
  await page.evaluate(() => document.body.style.backgroundColor = 'red');
  await page._delegate.startVideoRecording({outputFile: videoFile, width: 640, height: 480});
  // TODO: force repaint in firefox headless when video recording starts
  // and avoid following resize.
  // TODO: in WebKit figure out why video size is not reported correctly for
  // static pictures.
  if (HEADLESS)
    await page.setViewportSize({width: 1270, height: 950});
  await new Promise(r => setTimeout(r, 300));
  await page._delegate.stopVideoRecording();
  expect(fs.existsSync(videoFile)).toBe(true);
  await page.goto(url.pathToFileURL(videoFile).href);

  await page.$eval('video', v => {
    return new Promise(fulfil => {
      // In case video playback autostarts.
      v.pause();
      v.onplaying = fulfil;
      v.play();
    });
  });
  await page.$eval('video', v => {
    v.pause();
    const result = new Promise(f => v.onseeked = f);
    // v.currentTime = v.duration - 0.01;
    v.currentTime = v.duration - 0.01;
    return result;
  });

  const duration = await page.$eval('video', v => v.duration);
  console.log(duration);
  expect(duration).toBeGreaterThan(0);
  const videoWidth = await page.$eval('video', v => v.videoWidth);
  expect(videoWidth).toBe(640);
  const videoHeight = await page.$eval('video', v => v.videoHeight);
  expect(videoHeight).toBe(480);

  const pixels = await page.$eval('video', video => {
    let canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0);
    const imgd = context.getImageData(0, 0, 10, 10);
    return Array.from(imgd.data);
  });
  const expectAlmostRed = (i) => {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const alpha = pixels[i + 3];
    expect(r).toBeGreaterThan(245);
    expect(g).toBeLessThan(10);
    expect(b).toBeLessThan(20);
    expect(alpha).toBe(255);
  }
  console.log(pixels);
  for (var i = 0, n = pixels.length; i < n; i += 4)
    expectAlmostRed(i);
  console.log('Did stop screencast');
});

it('should work with PSON', async({page, server}) => {
  console.log('\n\nwill start screecast\n\n');
  await page._delegate.startVideoRecording({outputFile: 'v.webm', width: 1280, height: 720});
  await page.goto(server.PREFIX + '/poster-circle.html');
  await new Promise(r => setTimeout(r, 500));
  await page.goto(server.CROSS_PROCESS_PREFIX + '/animation.html');
  await new Promise(r => setTimeout(r, 500));
  await page._delegate.stopVideoRecording();
  const fileUrl = 'file:///home/yurys/playwright/v.webm';
  await page.goto(fileUrl)
  await page.$eval('video', v => v.pause());
  await page.$eval('video', v => v.currentTime = 0.1);
  await new Promise(r => setTimeout(r, 200))
  await page.$eval('video', v => v.currentTime = 0.2);
  await new Promise(r => setTimeout(r, 200));
  await page.$eval('video', v => v.currentTime = 0.3);
  await new Promise(r => setTimeout(r, 1000));
  console.log('Did stop screencast');
});

it('should record video playwright.dev', async({page, server}) => {
  console.log('will start screecast');
  await page._delegate.startVideoRecording({outputFile: 'v.webm', width: 1280, height: 720});
  await page.goto('https://playwright.dev/');
  await page.type('search-view > input', 'page.waitForSelector');
  await page.click('a.search-item.selected');
  await page.type('search-view > input', 'page.$');
  await page.press('search-view > input', 'Enter');
  await page.$('text=Shortcut for page.mainFrame().$(selector).');
  await page._delegate.stopVideoRecording();
  console.log('did stop screencast');
});


it('should record video', async({page, server}) => {
  console.log('\n\nwill start screecast\n\n');
  await page._delegate.startVideoRecording({outputFile: 'v.ivf', width: 1280, height: 720});
  await page.goto('https://theverge.com');
  await page.hover('[data-nav-item-id="tech"]');
  await page.click('text=Microsoft');
  await page.waitForSelector('text=all the latest Microsoft news');
  await page.click('text=new Edge browser now rolling out via Windows Update');
  await page.waitForNavigation({url:'https://www.theverge.com/2020/6/3/21279141/microsoft-edge-available-new-download-windows-update-rollout'})
  await page._delegate.stopVideoRecording();
  console.log('Did stop screencast');
});


it('should record window resize', async({page, server}) => {
  console.log('\n\nwill start screecast\n\n');
  await page._delegate.startVideoRecording({outputFile: 'v.ivf', width: 1280, height: 720});
  const response = await page.goto(server.PREFIX + '/animation.html');
  // const response = await page.goto(server.PREFIX + '/poster-circle.html');
  expect(response.status()).toBe(200);
  for (let i = 100; i < 500; i +=  100) {
    await new Promise(r => setTimeout(r, 100));
    await page.setViewportSize({width: 1280 - i , height: 720 + i});
  }
  await new Promise(r => setTimeout(r, 500));
  await page._delegate.stopVideoRecording();
  console.log('Did stop screencast');
});
