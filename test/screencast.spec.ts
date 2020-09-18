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

import { options, playwrightFixtures } from './playwright.fixtures';
import type { Page } from '..';

import fs from 'fs';
import path from 'path';
import { TestServer } from '../utils/testserver';
import { mkdirIfNeeded } from '../lib/utils/utils';

type WorkerState = {
  videoDir: string;
};
type TestState = {
  videoPlayer: VideoPlayer;
  videoFile: string;
};
const fixtures = playwrightFixtures.declareWorkerFixtures<WorkerState>().declareTestFixtures<TestState>();
const { it, expect, describe, defineTestFixture, defineWorkerFixture, overrideWorkerFixture } = fixtures;

defineWorkerFixture('videoDir', async ({}, test, config) => {
  await test(path.join(config.outputDir, 'screencast'));
});

overrideWorkerFixture('browser', async ({browserType, defaultBrowserOptions, videoDir}, test) => {
  const browser = await browserType.launch({
    ...defaultBrowserOptions,
    // Make sure videos are stored on the same volume as the test output dir.
    _videosPath: videoDir,
  });
  await test(browser);
  await browser.close();
});

defineTestFixture('videoPlayer', async ({playwright, context, server}, test) => {
  // WebKit on Mac & Windows cannot replay webm/vp8 video, is unrelyable
  // on Linux (times out) and in Firefox, so we always launch chromium for
  // playback.
  const chromium = await playwright.chromium.launch();
  context = await chromium.newContext();

  const page = await context.newPage();
  const player = new VideoPlayer(page, server);
  await test(player);
  if (chromium)
    await chromium.close();
  else
    await page.close();
});

defineTestFixture('videoFile', async ({browserType, videoDir}, runTest, info) => {
  const { test } = info;
  const sanitizedTitle = test.title.replace(/[^\w\d]+/g, '_');
  const videoFile = path.join(videoDir, `${browserType.name()}-${sanitizedTitle}-${test.results.length}_v.webm`);
  await mkdirIfNeeded(videoFile);
  await runTest(videoFile);
});

function almostRed(r, g, b, alpha) {
  expect(r).toBeGreaterThan(240);
  expect(g).toBeLessThan(50);
  expect(b).toBeLessThan(50);
  expect(alpha).toBe(255);
}

function almostBlack(r, g, b, alpha) {
  expect(r).toBeLessThan(10);
  expect(g).toBeLessThan(10);
  expect(b).toBeLessThan(10);
  expect(alpha).toBe(255);
}

function almostGrey(r, g, b, alpha) {
  expect(r).toBeGreaterThanOrEqual(90);
  expect(g).toBeGreaterThanOrEqual(90);
  expect(b).toBeGreaterThanOrEqual(90);
  expect(r).toBeLessThan(110);
  expect(g).toBeLessThan(110);
  expect(b).toBeLessThan(110);
  expect(alpha).toBe(255);
}

function expectAll(pixels, rgbaPredicate) {
  const checkPixel = i => {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const alpha = pixels[i + 3];
    rgbaPredicate(r, g, b, alpha);
  };
  try {
    for (let i = 0, n = pixels.length; i < n; i += 4)
      checkPixel(i);
  } catch (e) {
    // Log pixel values on failure.
    e.message += `\n\nActual pixels=[${pixels}]`;
    throw e;
  }
}

class VideoPlayer {
  private readonly _page: Page;
  private readonly _server: TestServer;
  constructor(page: Page, server: TestServer) {
    this._page = page;
    this._server = server;
  }

  async load(videoFile: string) {
    const servertPath = '/v.webm';
    this._server.setRoute(servertPath, (req, response) => {
      this._server.serveFile(req, response, videoFile);
    });

    await this._page.goto(this._server.PREFIX + '/player.html');
  }

  async duration() {
    return await this._page.$eval('video', (v: HTMLVideoElement) => v.duration);
  }

  async videoWidth() {
    return await this._page.$eval('video', (v: HTMLVideoElement) => v.videoWidth);
  }

  async videoHeight() {
    return await this._page.$eval('video', (v: HTMLVideoElement) => v.videoHeight);
  }

  async seekFirstNonEmptyFrame() {
    await this._page.evaluate(async () => await (window as any).playToTheEnd());
    while (true) {
      await this._page.evaluate(async () => await (window as any).playOneFrame());
      const ended = await this._page.$eval('video', (video: HTMLVideoElement) => video.ended);
      if (ended)
        throw new Error('All frames are empty');
      const pixels = await this.pixels();
      // Quick check if all pixels are almost white. In Firefox blank page is not
      // truly white so whe check approximately.
      if (!pixels.every(p => p > 245))
        return;
    }
  }

  async countFrames() {
    return await this._page.evaluate(async () => await (window as any).countFrames());
  }
  async currentTime() {
    return await this._page.$eval('video', (v: HTMLVideoElement) => v.currentTime);
  }
  async playOneFrame() {
    return await this._page.evaluate(async () => await (window as any).playOneFrame());
  }

  async seekLastFrame() {
    return await this._page.evaluate(async x => await (window as any).seekLastFrame());
  }

  async pixels(point = {x: 0, y: 0}) {
    const pixels = await this._page.$eval('video', (video: HTMLVideoElement, point) => {
      const canvas = document.createElement('canvas');
      if (!video.videoWidth || !video.videoHeight)
        throw new Error('Video element is empty');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      context.drawImage(video, 0, 0);
      const imgd = context.getImageData(point.x, point.y, 10, 10);
      return Array.from(imgd.data);
    }, point);
    return pixels;
  }
}

describe('screencast', suite => {
  suite.slow();
}, () => {
  it.only('should click wrapped links', async ({browser, server}) => {
    const context = await browser.newContext({ _recordVideos: true });
    const page = await context.newPage();

    const v1 = await page.waitForEvent('_videostarted');
    await page.goto(server.PREFIX + '/wrappedlink.html');
    await page.waitForTimeout(1000);
    const [popup, v2] = await Promise.all([
      page.waitForEvent('popup'),
      new Promise<any>(r => context.on('page', page => page.on('_videostarted', r))),
      page.evaluate(url => window.open(url), server.PREFIX + '/input/scrollable.html'),
    ]);
    await page.click('a');
    await popup.click('#button-5');
    await popup.waitForTimeout(1000);
    // expect(await page.evaluate('__clicked')).toBe(true);
    await Promise.all([
      page.close(),
      popup.close()
    ]);
    await Promise.all([(v1 as any).path(), (v2 as any).path()]);
    console.log('Closed all pages');
    await context.close();
  });

  it('should capture static page', async ({browser, videoPlayer, videoFile}) => {
    const context = await browser.newContext({ _recordVideos: true, _videoSize: { width: 320, height: 240 } });
    const page = await context.newPage();
    const video = await page.waitForEvent('_videostarted') as any;

    await page.evaluate(() => document.body.style.backgroundColor = 'red');
    await new Promise(r => setTimeout(r, 1000));
    await page.close();

    const tmpPath = await video.path();
    expect(fs.existsSync(tmpPath)).toBe(true);
    fs.renameSync(tmpPath, videoFile);

    await videoPlayer.load(videoFile);
    const duration = await videoPlayer.duration();
    expect(duration).toBeGreaterThan(0);

    expect(await videoPlayer.videoWidth()).toBe(320);
    expect(await videoPlayer.videoHeight()).toBe(240);

    await videoPlayer.seekLastFrame();
    const pixels = await videoPlayer.pixels();
    expectAll(pixels, almostRed);
  });

  it('should capture navigation', (test, parameters) => {
    test.flaky();
  }, async ({browser, server, videoPlayer, videoFile}) => {
    const context = await browser.newContext({ _recordVideos: true, _videoSize: { width: 1280, height: 720 } });
    const page = await context.newPage();
    const video = await page.waitForEvent('_videostarted') as any;

    await page.goto(server.PREFIX + '/background-color.html#rgb(0,0,0)');
    await new Promise(r => setTimeout(r, 1000));
    await page.goto(server.CROSS_PROCESS_PREFIX + '/background-color.html#rgb(100,100,100)');
    await new Promise(r => setTimeout(r, 1000));
    await page.close();

    const tmpPath = await video.path();
    expect(fs.existsSync(tmpPath)).toBe(true);
    fs.renameSync(tmpPath, videoFile);

    await videoPlayer.load(videoFile);
    const duration = await videoPlayer.duration();
    expect(duration).toBeGreaterThan(0);

    {
      await videoPlayer.seekFirstNonEmptyFrame();
      const pixels = await videoPlayer.pixels();
      expectAll(pixels, almostBlack);
    }

    {
      await videoPlayer.seekLastFrame();
      const pixels = await videoPlayer.pixels();
      expectAll(pixels, almostGrey);
    }
  });

  it('should capture css transformation', (test, parameters) => {
    test.fail(options.WEBKIT(parameters) && options.WIN(parameters), 'Does not work on WebKit Windows');
  }, async ({browser, server, videoPlayer, videoFile}) => {
    const size = {width: 320, height: 240};
    // Set viewport equal to screencast frame size to avoid scaling.
    const context = await browser.newContext({ _recordVideos: true, _videoSize: size, viewport: size });
    const page = await context.newPage();
    const video = await page.waitForEvent('_videostarted') as any;

    await page.goto(server.PREFIX + '/rotate-z.html');
    await new Promise(r => setTimeout(r, 1000));
    await page.close();

    const tmpPath = await video.path();
    expect(fs.existsSync(tmpPath)).toBe(true);
    fs.renameSync(tmpPath, videoFile);

    await videoPlayer.load(videoFile);
    const duration = await videoPlayer.duration();
    expect(duration).toBeGreaterThan(0);

    {
      await videoPlayer.seekLastFrame();
      const pixels = await videoPlayer.pixels({x: 95, y: 45});
      expectAll(pixels, almostRed);
    }
  });

  it('should automatically start/finish when new page is created/closed', async ({browser, videoDir}) => {
    const context = await browser.newContext({ _recordVideos: true, _videoSize: { width: 320, height: 240 }});
    const [screencast, newPage] = await Promise.all([
      new Promise<any>(r => context.on('page', page => page.on('_videostarted', r))),
      context.newPage(),
    ]);

    const [videoFile] = await Promise.all([
      screencast.path(),
      newPage.close(),
    ]);
    expect(path.dirname(videoFile)).toBe(videoDir);
    await context.close();
  });

  it('should finish when contex closes', async ({browser, videoDir}) => {
    const context = await browser.newContext({ _recordVideos: true, _videoSize: { width: 320, height: 240 } });

    const [video] = await Promise.all([
      new Promise<any>(r => context.on('page', page => page.on('_videostarted', r))),
      context.newPage(),
    ]);

    const [videoFile] = await Promise.all([
      video.path(),
      context.close(),
    ]);
    expect(path.dirname(videoFile)).toBe(videoDir);
  });

  it('should fire striclty after context.newPage', async ({browser}) => {
    const context = await browser.newContext({ _recordVideos: true, _videoSize: { width: 320, height: 240 } });
    const page = await context.newPage();
    // Should not hang.
    await page.waitForEvent('_videostarted');
    await context.close();
  });

  it('should fire start event for popups', async ({browser, videoDir, server}) => {
    const context = await browser.newContext({ _recordVideos: true, _videoSize: { width: 320, height: 240 } });

    const [page] = await Promise.all([
      context.newPage(),
      new Promise<any>(r => context.on('page', page => page.on('_videostarted', r))),
    ]);
    await page.goto(server.EMPTY_PAGE);
    const [video, popup] = await Promise.all([
      new Promise<any>(r => context.on('page', page => page.on('_videostarted', r))),
      new Promise<Page>(resolve => context.on('page', resolve)),
      page.evaluate(() => { window.open('about:blank'); })
    ]);
    const [videoFile] = await Promise.all([
      video.path(),
      popup.close()
    ]);
    expect(path.dirname(videoFile)).toBe(videoDir);
  });

  it('should scale frames down to the requested size ', async ({browser, videoPlayer, videoFile, server}) => {
    const context = await browser.newContext({
      viewport: {width: 640, height: 480},
      // Set size to 1/2 of the viewport.
      _recordVideos: true,
      _videoSize: { width: 320, height: 240 },
    });
    const page = await context.newPage();
    const video = await page.waitForEvent('_videostarted') as any;

    await page.goto(server.PREFIX + '/checkerboard.html');
    // Update the picture to ensure enough frames are generated.
    await page.$eval('.container', container => {
      container.firstElementChild.classList.remove('red');
    });
    await new Promise(r => setTimeout(r, 300));
    await page.$eval('.container', container => {
      container.firstElementChild.classList.add('red');
    });
    await new Promise(r => setTimeout(r, 1000));
    await page.close();

    const tmp = await video.path();
    expect(fs.existsSync(tmp)).toBe(true);
    fs.renameSync(tmp, videoFile);

    await videoPlayer.load(videoFile);
    const duration = await videoPlayer.duration();
    expect(duration).toBeGreaterThan(0);

    await videoPlayer.seekLastFrame();
    {
      const pixels = await videoPlayer.pixels({x: 0, y: 0});
      expectAll(pixels, almostRed);
    }
    {
      const pixels = await videoPlayer.pixels({x: 300, y: 0});
      expectAll(pixels, almostGrey);
    }
    {
      const pixels = await videoPlayer.pixels({x: 0, y: 200});
      expectAll(pixels, almostGrey);
    }
    {
      const pixels = await videoPlayer.pixels({x: 300, y: 200});
      expectAll(pixels, almostRed);
    }
  });

  it('should use viewport as default size', async ({browser, videoPlayer, videoFile}) => {
    const size = {width: 800, height: 600};
    const context = await browser.newContext({_recordVideos: true, viewport: size});

    const [video] = await Promise.all([
      new Promise<any>(r => context.on('page', page => page.on('_videostarted', r))),
      context.newPage(),
    ]);
    await new Promise(r => setTimeout(r, 1000));
    const [tmpPath] = await Promise.all([
      video.path(),
      context.close(),
    ]);

    expect(fs.existsSync(tmpPath)).toBe(true);
    fs.renameSync(tmpPath, videoFile);
    await videoPlayer.load(videoFile);
    expect(await videoPlayer.videoWidth()).toBe(size.width);
    expect(await videoPlayer.videoHeight()).toBe(size.height);
  });

  it('should be 1280x720 by default', async ({browser, videoPlayer, videoFile}) => {
    const context = await browser.newContext({_recordVideos: true});

    const [video] = await Promise.all([
      new Promise<any>(r => context.on('page', page => page.on('_videostarted', r))),
      context.newPage(),
    ]);
    await new Promise(r => setTimeout(r, 1000));
    const [tmpPath] = await Promise.all([
      video.path(),
      context.close(),
    ]);

    expect(fs.existsSync(tmpPath)).toBe(true);
    fs.renameSync(tmpPath, videoFile);
    await videoPlayer.load(videoFile);
    expect(await videoPlayer.videoWidth()).toBe(1280);
    expect(await videoPlayer.videoHeight()).toBe(720);
  });

  it('should create read stream', async ({browser, server}) => {
    const context = await browser.newContext({_recordVideos: true});

    const page = await context.newPage();
    const video = await page.waitForEvent('_videostarted') as any;
    await page.goto(server.PREFIX + '/grid.html');
    await new Promise(r => setTimeout(r, 1000));
    const [stream, path] = await Promise.all([
      video.createReadStream(),
      video.path(),
      // TODO: make it work with dead context!
      page.close(),
    ]);

    const bufs = [];
    stream.on('data', data => bufs.push(data));
    await new Promise(f => stream.on('end', f));
    const streamedData = Buffer.concat(bufs);
    expect(fs.readFileSync(path).compare(streamedData)).toBe(0);
  });

  it('should saveAs', async ({browser, server, tmpDir}) => {
    const context = await browser.newContext({_recordVideos: true});

    const page = await context.newPage();
    const video = await page.waitForEvent('_videostarted') as any;
    await page.goto(server.PREFIX + '/grid.html');
    await new Promise(r => setTimeout(r, 1000));
    const saveAsPath = path.join(tmpDir, 'v.webm');
    const [videoPath] = await Promise.all([
      video.path(),
      video.saveAs(saveAsPath),
      // TODO: make it work with dead context!
      page.close(),
    ]);

    expect(fs.readFileSync(videoPath).compare(fs.readFileSync(saveAsPath))).toBe(0);
  });
});