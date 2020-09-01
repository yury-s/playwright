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

import { options } from './playwright.fixtures';
import { registerFixture } from '@playwright/test-runner';
import type { Page } from '..';

import fs from 'fs';
import path from 'path';
import { TestServer } from '../utils/testserver';


declare global {
  interface TestState {
    videoPlayer: VideoPlayer;
  }
}

registerFixture('videoPlayer', async ({playwright, context, server}, test) => {
  let firefox;
  if (options.WEBKIT && !LINUX) {
    // WebKit on Mac & Windows cannot replay webm/vp8 video, so we launch Firefox.
    firefox = await playwright.firefox.launch();
    context = await firefox.newContext();
  }

  const page = await context.newPage();
  const player = new VideoPlayer(page, server);
  await test(player);
  if (firefox)
    await firefox.close();
  else
    await page.close();
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
      if (!pixels.every(p => p === 255))
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
    return await this._page.evaluate(async () => await (window as any).seekLastFrame());
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
  suite.skip(options.WIRE);
}, () => {
  it('should capture static page', test => {
    test.flaky(options.CHROMIUM && LINUX && !options.HEADLESS);
    test.flaky(options.WEBKIT && LINUX);
  }, async ({page, tmpDir, videoPlayer, toImpl}) => {
    const videoFile = path.join(tmpDir, 'v.webm');
    await page.evaluate(() => document.body.style.backgroundColor = 'red');
    await toImpl(page)._delegate.startScreencast({outputFile: videoFile, width: 640, height: 480});
    // TODO: in WebKit figure out why video size is not reported correctly for
    // static pictures.
    if (options.HEADLESS && options.WEBKIT)
      await page.setViewportSize({width: 1270, height: 950});
    await new Promise(r => setTimeout(r, 300));
    await toImpl(page)._delegate.stopScreencast();
    expect(fs.existsSync(videoFile)).toBe(true);

    await videoPlayer.load(videoFile);
    const duration = await videoPlayer.duration();
    expect(duration).toBeGreaterThan(0);

    expect(await videoPlayer.videoWidth()).toBe(640);
    expect(await videoPlayer.videoHeight()).toBe(480);

    await videoPlayer.seekLastFrame();
    const pixels = await videoPlayer.pixels();
    expectAll(pixels, almostRed);
  });

  fit('should capture navigation', test => {
    test.flaky(options.CHROMIUM && MAC);
    test.flaky(options.FIREFOX);
    // test.flaky(options.WEBKIT);
  }, async ({page, tmpDir, server, videoPlayer, toImpl}) => {
    const videoFile = '/Users/yurys/playwright/v.webm';
    await page.setViewportSize({width: 1280, height: 960});
    await page.goto(server.PREFIX + '/background-color.html#rgb(0,0,0)');
    await toImpl(page)._delegate.startScreencast({outputFile: videoFile, width: 640, height: 480, scale: 0.25});
    // TODO: in WebKit figure out why video size is not reported correctly for
    // static pictures.
    if (options.HEADLESS && options.WEBKIT)
      await page.setViewportSize({width: 1270, height: 950});
    await page.goto('https://news.google.com');
    await page.setViewportSize({width: 640, height: 1960});
    await new Promise(r => setTimeout(r, 500));
    await page.setViewportSize({width: 1980, height: 480});
    await new Promise(r => setTimeout(r, 500));
    await toImpl(page)._delegate.stopScreencast();
    expect(fs.existsSync(videoFile)).toBe(true);

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

  it('should capture css transformation', test => {
    test.fixme(options.WEBKIT && WIN, 'Accelerated compositing is disabled in WebKit on Windows.');
    test.flaky(options.WEBKIT && LINUX);
  }, async ({page, tmpDir, server, videoPlayer, toImpl}) => {
    const videoFile = path.join(tmpDir, 'v.webm');
    // Chromium automatically fits all frames to fit specified size. To avoid
    // unwanted transformations we set view port size equal to the screencast
    // size.
    // TODO: support explicit 'scale' parameter in CDP.
    if (options.CHROMIUM)
      await page.setViewportSize({width: 640, height: 480});
    await page.goto(server.PREFIX + '/rotate-z.html');
    await toImpl(page)._delegate.startScreencast({outputFile: videoFile, width: 640, height: 480});
    // TODO: in WebKit figure out why video size is not reported correctly for
    // static pictures.
    if (options.HEADLESS && options.WEBKIT)
      await page.setViewportSize({width: 1270, height: 950});
    // 300 is not enough for Chromium headful.
    await new Promise(r => setTimeout(r, 500));
    await toImpl(page)._delegate.stopScreencast();
    expect(fs.existsSync(videoFile)).toBe(true);

    await videoPlayer.load(videoFile);
    const duration = await videoPlayer.duration();
    expect(duration).toBeGreaterThan(0);

    {
      await videoPlayer.seekLastFrame();
      const pixels = await videoPlayer.pixels({x: 95, y: 45});
      expectAll(pixels, almostRed);
    }
  });

  it('should sutomatically start/finish when new page is created/closed', test => {
    test.flaky(options.FIREFOX, 'Even slow is not slow enough');
  }, async ({browser, tmpDir, toImpl}) => {
    // Use server side of the context. All the code below also uses server side APIs.
    const context = toImpl(await browser.newContext());
    await context._enableScreencast({width: 320, height: 240, dir: tmpDir});
    expect(context._screencastOptions).toBeTruthy();

    const [screencast, newPage] = await Promise.all([
      new Promise(resolve => context.on('screencaststarted', resolve)) as Promise<any>,
      context.newPage(),
    ]);
    expect(screencast.page === newPage).toBe(true);

    const [videoFile] = await Promise.all([
      screencast.path(),
      newPage.close(),
    ]);
    expect(path.dirname(videoFile)).toBe(tmpDir);
    await context.close();
  });

  it('should finish when contex closes', async ({browser, tmpDir, toImpl}) => {
    // Use server side of the context. All the code below also uses server side APIs.
    const context = toImpl(await browser.newContext());
    await context._enableScreencast({width: 320, height: 240, dir: tmpDir});
    expect(context._screencastOptions).toBeTruthy();

    const [screencast, newPage] = await Promise.all([
      new Promise(resolve => context.on('screencaststarted', resolve)) as Promise<any>,
      context.newPage(),
    ]);
    expect(screencast.page === newPage).toBe(true);

    const [videoFile] = await Promise.all([
      screencast.path(),
      context.close(),
    ]);
    expect(path.dirname(videoFile)).toBe(tmpDir);
  });

  it('should fire start event for popups', async ({browser, tmpDir, server, toImpl}) => {
    // Use server side of the context. All the code below also uses server side APIs.
    const context = toImpl(await browser.newContext());
    await context._enableScreencast({width: 640, height: 480, dir: tmpDir});
    expect(context._screencastOptions).toBeTruthy();

    const page = await context.newPage();
    await page.mainFrame().goto(server.EMPTY_PAGE);
    const [screencast, popup] = await Promise.all([
      new Promise(resolve => context.on('screencaststarted', resolve)) as Promise<any>,
      new Promise(resolve => context.on('page', resolve)) as Promise<any>,
      page.mainFrame()._evaluateExpression(() => {
        const win = window.open('about:blank');
        win.close();
      }, true)
    ]);
    expect(screencast.page === popup).toBe(true);
    expect(path.dirname(await screencast.path())).toBe(tmpDir);
    await context.close();
  });
});
