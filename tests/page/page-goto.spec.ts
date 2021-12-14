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

import url from 'url';
import os from 'os';
import { test as it, expect } from './pageTest';
import { expectedSSLError } from '../config/utils';

it('should work', async ({ page, server }) => {
  server.setRoute('/redir', (req, res) => {
    console.log('req headers ' + JSON.stringify(req.headers, null, 2));
    res.writeHead(302, {
      'Accept-CH': 'Sec-CH-UA, Sec-CH-UA-Arch, Sec-CH-UA-Bitness, Sec-CH-UA-Full-Version-List, Sec-CH-UA-Full-Version, Sec-CH-UA-Mobile, Sec-CH-UA-Model, Sec-CH-UA-Platform, Sec-CH-UA-Platform-Version',
      'location': '/empty.html'
    });
    res.end();
  });
  server.setRoute('/empty.html', (req, res) => {
    console.log('req headers ' + JSON.stringify(req.headers, null, 2));
    res.setHeader('Accept-CH', 'Sec-CH-UA, Sec-CH-UA-Arch, Sec-CH-UA-Bitness, Sec-CH-UA-Full-Version-List, Sec-CH-UA-Full-Version, Sec-CH-UA-Mobile, Sec-CH-UA-Model, Sec-CH-UA-Platform, Sec-CH-UA-Platform-Version');
    res.end();
  });
  server.setRoute('/empty.html?id=1', (req, res) => {
    console.log('req headers ' + JSON.stringify(req.headers, null, 2));
    res.setHeader('Accept-CH', 'Sec-CH-UA, Sec-CH-UA-Arch, Sec-CH-UA-Bitness, Sec-CH-UA-Full-Version-List, Sec-CH-UA-Full-Version, Sec-CH-UA-Mobile, Sec-CH-UA-Model, Sec-CH-UA-Platform, Sec-CH-UA-Platform-Version');
    res.end();
  });
  await page.route(() => false, r => {});
  console.log('AAA\n\n\n');
  // await page.goto(server.PREFIX + '/redir');
  await page.goto(server.EMPTY_PAGE);
  await page.goto(server.EMPTY_PAGE);
  // await page.goto(server.EMPTY_PAGE + '?id=1');
  console.log('BBB\n\n\n');
  // expect(page.url()).toBe(server.EMPTY_PAGE);
});

it('should go to google', async ({ page, server }) => {
  await page.route(() => false, async route => {
    console.log('intercept');
    await route.continue();
  });
  // page.on('request', async r => console.log('req ' + r.url() + '\n' + JSON.stringify(await r.allHeaders(), null, 2)));
  // page.on('response', async r => console.log('res ' + r.url() + '\n' + JSON.stringify(await r.allHeaders(), null, 2)));
  await page.goto('https://google.com');
  // expect(page.url()).toBe(server.EMPTY_PAGE);
});

it('should work with file URL', async ({ page, asset, isAndroid }) => {
  it.skip(isAndroid, 'No files on Android');

  const fileurl = url.pathToFileURL(asset('frames/two-frames.html')).href;
  await page.goto(fileurl);
  expect(page.url().toLowerCase()).toBe(fileurl.toLowerCase());
  expect(page.frames().length).toBe(3);
});

it('should use http for no protocol', async ({ page, server, isAndroid }) => {
  it.skip(isAndroid);

  await page.goto(server.EMPTY_PAGE.substring('http://'.length));
  expect(page.url()).toBe(server.EMPTY_PAGE);
});

it('should work cross-process', async ({ page, server }) => {
  await page.goto(server.EMPTY_PAGE);
  expect(page.url()).toBe(server.EMPTY_PAGE);

  const url = server.CROSS_PROCESS_PREFIX + '/empty.html';
  let requestFrame;
  page.on('request', r => {
    if (r.url() === url)
      requestFrame = r.frame();
  });
  const response = await page.goto(url);
  expect(page.url()).toBe(url);
  expect(response.frame()).toBe(page.mainFrame());
  expect(requestFrame).toBe(page.mainFrame());
  expect(response.url()).toBe(url);
});

it('should work with cross-process that fails before committing', async ({ page, server }) => {
  server.setRoute('/empty.html', (req, res) => {
    req.socket.destroy();
  });
  const response1 = await page.goto(server.CROSS_PROCESS_PREFIX + '/title.html');
  await response1.finished();
  const error = await page.goto(server.EMPTY_PAGE).catch(e => e);
  expect(error instanceof Error).toBeTruthy();
});

it('should work with Cross-Origin-Opener-Policy', async ({ page, server, browserName }) => {
  server.setRoute('/empty.html', (req, res) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.end();
  });
  const requests = new Set();
  const events = [];
  page.on('request', r => {
    events.push('request');
    requests.add(r);
  });
  page.on('requestfailed', r => {
    events.push('requestfailed');
    requests.add(r);
  });
  page.on('requestfinished', r => {
    events.push('requestfinished');
    requests.add(r);
  });
  page.on('response', r => {
    events.push('response');
    requests.add(r.request());
  });
  const response = await page.goto(server.EMPTY_PAGE);
  expect(page.url()).toBe(server.EMPTY_PAGE);
  await response.finished();
  expect(events).toEqual(['request', 'response', 'requestfinished']);
  expect(requests.size).toBe(1);
  expect(response.request().failure()).toBeNull();
});

it('should work with Cross-Origin-Opener-Policy after redirect', async ({ page, server, browserName }) => {
  server.setRedirect('/redirect', '/empty.html');
  server.setRoute('/empty.html', (req, res) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.end();
  });
  const requests = new Set();
  const events = [];
  page.on('request', r => {
    events.push('request');
    requests.add(r);
  });
  page.on('requestfailed', r => {
    events.push('requestfailed');
    requests.add(r);
  });
  page.on('requestfinished', r => {
    events.push('requestfinished');
    requests.add(r);
  });
  page.on('response', r => {
    events.push('response');
    requests.add(r.request());
  });
  const response = await page.goto(server.PREFIX + '/redirect');
  expect(page.url()).toBe(server.EMPTY_PAGE);
  await response.finished();
  expect(events).toEqual(['request', 'response', 'requestfinished', 'request', 'response', 'requestfinished']);
  expect(requests.size).toBe(2);
  expect(response.request().failure()).toBeNull();
  const firstRequest = response.request().redirectedFrom();
  expect(firstRequest).toBeTruthy();
  expect(firstRequest.url()).toBe(server.PREFIX + '/redirect');
});

it('should capture iframe navigation request', async ({ page, server }) => {
  await page.goto(server.EMPTY_PAGE);
  expect(page.url()).toBe(server.EMPTY_PAGE);

  let requestFrame;
  page.on('request', r => {
    if (r.url() === server.PREFIX + '/frames/frame.html')
      requestFrame = r.frame();
  });
  const response = await page.goto(server.PREFIX + '/frames/one-frame.html');
  expect(page.url()).toBe(server.PREFIX + '/frames/one-frame.html');
  expect(response.frame()).toBe(page.mainFrame());
  expect(response.url()).toBe(server.PREFIX + '/frames/one-frame.html');

  expect(page.frames().length).toBe(2);
  expect(requestFrame).toBe(page.frames()[1]);
});

it('should capture cross-process iframe navigation request', async ({ page, server }) => {
  await page.goto(server.EMPTY_PAGE);
  expect(page.url()).toBe(server.EMPTY_PAGE);

  let requestFrame;
  page.on('request', r => {
    if (r.url() === server.CROSS_PROCESS_PREFIX + '/frames/frame.html')
      requestFrame = r.frame();
  });
  const response = await page.goto(server.CROSS_PROCESS_PREFIX + '/frames/one-frame.html');
  expect(page.url()).toBe(server.CROSS_PROCESS_PREFIX + '/frames/one-frame.html');
  expect(response.frame()).toBe(page.mainFrame());
  expect(response.url()).toBe(server.CROSS_PROCESS_PREFIX + '/frames/one-frame.html');

  expect(page.frames().length).toBe(2);
  expect(requestFrame).toBe(page.frames()[1]);
});

it('should work with anchor navigation', async ({ page, server }) => {
  await page.goto(server.EMPTY_PAGE);
  expect(page.url()).toBe(server.EMPTY_PAGE);
  await page.goto(server.EMPTY_PAGE + '#foo');
  expect(page.url()).toBe(server.EMPTY_PAGE + '#foo');
  await page.goto(server.EMPTY_PAGE + '#bar');
  expect(page.url()).toBe(server.EMPTY_PAGE + '#bar');
});

it('should work with redirects', async ({ page, server }) => {
  server.setRedirect('/redirect/1.html', '/redirect/2.html');
  server.setRedirect('/redirect/2.html', '/empty.html');
  const response = await page.goto(server.PREFIX + '/redirect/1.html');
  expect(response.status()).toBe(200);
  expect(page.url()).toBe(server.EMPTY_PAGE);
});

it('should navigate to about:blank', async ({ page, server }) => {
  const response = await page.goto('about:blank');
  expect(response).toBe(null);
});

it('should return response when page changes its URL after load', async ({ page, server }) => {
  const response = await page.goto(server.PREFIX + '/historyapi.html');
  expect(response.status()).toBe(200);
});

it('should work with subframes return 204', async ({ page, server }) => {
  server.setRoute('/frames/frame.html', (req, res) => {
    res.statusCode = 204;
    res.end();
  });
  await page.goto(server.PREFIX + '/frames/one-frame.html');
});

it('should work with subframes return 204 with domcontentloaded', async ({ page, server }) => {
  server.setRoute('/frames/frame.html', (req, res) => {
    res.statusCode = 204;
    res.end();
  });
  await page.goto(server.PREFIX + '/frames/one-frame.html', { waitUntil: 'domcontentloaded' });
});

it('should fail when server returns 204', async ({ page, server, browserName }) => {
  // WebKit just loads an empty page.
  server.setRoute('/empty.html', (req, res) => {
    res.statusCode = 204;
    res.end();
  });
  let error = null;
  await page.goto(server.EMPTY_PAGE).catch(e => error = e);
  expect(error).not.toBe(null);
  if (browserName === 'chromium')
    expect(error.message).toContain('net::ERR_ABORTED');
  else if (browserName === 'webkit')
    expect(error.message).toContain('Aborted: 204 No Content');
  else
    expect(error.message).toContain('NS_BINDING_ABORTED');
});

it('should navigate to empty page with domcontentloaded', async ({ page, server }) => {
  const response = await page.goto(server.EMPTY_PAGE, { waitUntil: 'domcontentloaded' });
  expect(response.status()).toBe(200);
});

it('should work when page calls history API in beforeunload', async ({ page, server }) => {
  await page.goto(server.EMPTY_PAGE);
  await page.evaluate(() => {
    window.addEventListener('beforeunload', () => history.replaceState(null, 'initial', window.location.href), false);
  });
  const response = await page.goto(server.PREFIX + '/grid.html');
  expect(response.status()).toBe(200);
});

it('should fail when navigating to bad url', async ({ mode, page, browserName }) => {
  it.fixme(mode === 'service', 'baseURL is inherited from webServer in config');
  let error = null;
  await page.goto('asdfasdf').catch(e => error = e);
  if (browserName === 'chromium' || browserName === 'webkit')
    expect(error.message).toContain('Cannot navigate to invalid URL');
  else
    expect(error.message).toContain('Invalid url');
});

it('should fail when navigating to bad SSL', async ({ page, browserName, httpsServer }) => {
  // Make sure that network events do not emit 'undefined'.
  // @see https://crbug.com/750469
  page.on('request', request => expect(request).toBeTruthy());
  page.on('requestfinished', request => expect(request).toBeTruthy());
  page.on('requestfailed', request => expect(request).toBeTruthy());
  let error = null;
  await page.goto(httpsServer.EMPTY_PAGE).catch(e => error = e);
  expect(error.message).toContain(expectedSSLError(browserName));
});

it('should fail when navigating to bad SSL after redirects', async ({ page, browserName, server, httpsServer }) => {
  server.setRedirect('/redirect/1.html', '/redirect/2.html');
  server.setRedirect('/redirect/2.html', '/empty.html');
  let error = null;
  await page.goto(httpsServer.PREFIX + '/redirect/1.html').catch(e => error = e);
  expect(error.message).toContain(expectedSSLError(browserName));
});

it('should not crash when navigating to bad SSL after a cross origin navigation', async ({ page, server, httpsServer }) => {
  await page.goto(server.CROSS_PROCESS_PREFIX + '/empty.html');
  await page.goto(httpsServer.EMPTY_PAGE).catch(e => void 0);
});

it('should not throw if networkidle0 is passed as an option', async ({ page, server }) => {
  // @ts-expect-error networkidle0 is undocumented
  await page.goto(server.EMPTY_PAGE, { waitUntil: 'networkidle0' });
});

it('should throw if networkidle2 is passed as an option', async ({ page, server }) => {
  let error = null;
  // @ts-expect-error networkidle2 is not allowed
  await page.goto(server.EMPTY_PAGE, { waitUntil: 'networkidle2' }).catch(err => error = err);
  expect(error.message).toContain(`waitUntil: expected one of (load|domcontentloaded|networkidle|commit)`);
});

it('should fail when main resources failed to load', async ({ page, browserName, isWindows, mode }) => {
  let error = null;
  await page.goto('http://localhost:44123/non-existing-url').catch(e => error = e);
  if (mode === 'service')
    expect(error.message).toContain('net::ERR_SOCKS_CONNECTION_FAILED');
  else if (browserName === 'chromium')
    expect(error.message).toContain('net::ERR_CONNECTION_REFUSED');
  else if (browserName === 'webkit' && isWindows)
    expect(error.message).toContain(`Couldn\'t connect to server`);
  else if (browserName === 'webkit')
    expect(error.message).toContain('Could not connect');
  else
    expect(error.message).toContain('NS_ERROR_CONNECTION_REFUSED');
});

it('should fail when exceeding maximum navigation timeout', async ({ page, server, playwright }) => {
  // Hang for request to the empty.html
  server.setRoute('/empty.html', (req, res) => { });
  let error = null;
  await page.goto(server.PREFIX + '/empty.html', { timeout: 1 }).catch(e => error = e);
  expect(error.message).toContain('page.goto: Timeout 1ms exceeded.');
  expect(error.message).toContain(server.PREFIX + '/empty.html');
  expect(error).toBeInstanceOf(playwright.errors.TimeoutError);
});

it('should fail when exceeding default maximum navigation timeout', async ({ page, server, playwright, isAndroid }) => {
  it.skip(isAndroid, 'No context per test');

  // Hang for request to the empty.html
  server.setRoute('/empty.html', (req, res) => { });
  let error = null;
  page.context().setDefaultNavigationTimeout(2);
  page.setDefaultNavigationTimeout(1);
  await page.goto(server.PREFIX + '/empty.html').catch(e => error = e);
  expect(error.message).toContain('page.goto: Timeout 1ms exceeded.');
  expect(error.message).toContain(server.PREFIX + '/empty.html');
  expect(error).toBeInstanceOf(playwright.errors.TimeoutError);
});

it('should fail when exceeding browser context navigation timeout', async ({ page, server, playwright, isAndroid }) => {
  it.skip(isAndroid, 'No context per test');

  // Hang for request to the empty.html
  server.setRoute('/empty.html', (req, res) => { });
  let error = null;
  page.context().setDefaultNavigationTimeout(2);
  await page.goto(server.PREFIX + '/empty.html').catch(e => error = e);
  expect(error.message).toContain('page.goto: Timeout 2ms exceeded.');
  expect(error.message).toContain(server.PREFIX + '/empty.html');
  expect(error).toBeInstanceOf(playwright.errors.TimeoutError);
});

it('should fail when exceeding default maximum timeout', async ({ page, server, playwright, isAndroid }) => {
  it.skip(isAndroid, 'No context per test');

  // Hang for request to the empty.html
  server.setRoute('/empty.html', (req, res) => { });
  let error = null;
  // Undo what harness did.
  page.context().setDefaultNavigationTimeout(undefined);
  page.context().setDefaultTimeout(2);
  page.setDefaultTimeout(1);
  await page.goto(server.PREFIX + '/empty.html').catch(e => error = e);
  expect(error.message).toContain('page.goto: Timeout 1ms exceeded.');
  expect(error.message).toContain(server.PREFIX + '/empty.html');
  expect(error).toBeInstanceOf(playwright.errors.TimeoutError);
});

it('should fail when exceeding browser context timeout', async ({ page, server, playwright, isAndroid }) => {
  it.skip(isAndroid, 'No context per test');

  // Hang for request to the empty.html
  server.setRoute('/empty.html', (req, res) => { });
  let error = null;
  // Undo what harness did.
  page.context().setDefaultNavigationTimeout(undefined);
  page.context().setDefaultTimeout(2);
  await page.goto(server.PREFIX + '/empty.html').catch(e => error = e);
  expect(error.message).toContain('page.goto: Timeout 2ms exceeded.');
  expect(error.message).toContain(server.PREFIX + '/empty.html');
  expect(error).toBeInstanceOf(playwright.errors.TimeoutError);
});

it('should prioritize default navigation timeout over default timeout', async ({ page, server, playwright }) => {
  // Hang for request to the empty.html
  server.setRoute('/empty.html', (req, res) => { });
  let error = null;
  page.setDefaultTimeout(0);
  page.setDefaultNavigationTimeout(1);
  await page.goto(server.PREFIX + '/empty.html').catch(e => error = e);
  expect(error.message).toContain('page.goto: Timeout 1ms exceeded.');
  expect(error.message).toContain(server.PREFIX + '/empty.html');
  expect(error).toBeInstanceOf(playwright.errors.TimeoutError);
});

it('should disable timeout when its set to 0', async ({ page, server }) => {
  let error = null;
  let loaded = false;
  page.once('load', () => loaded = true);
  await page.goto(server.PREFIX + '/grid.html', { timeout: 0, waitUntil: 'load' }).catch(e => error = e);
  expect(error).toBe(null);
  expect(loaded).toBe(true);
});

it('should fail when replaced by another navigation', async ({ page, server, browserName }) => {
  let anotherPromise;
  server.setRoute('/empty.html', (req, res) => {
    anotherPromise = page.goto(server.PREFIX + '/one-style.html');
    // Hang request to empty.html.
  });
  const error = await page.goto(server.PREFIX + '/empty.html').catch(e => e);
  await anotherPromise;
  if (browserName === 'chromium')
    expect(error.message).toContain('net::ERR_ABORTED');
  else if (browserName === 'webkit')
    expect(error.message).toContain('cancelled');
  else
    expect(error.message).toContain('NS_BINDING_ABORTED');
});

it('should work when navigating to valid url', async ({ page, server }) => {
  const response = await page.goto(server.EMPTY_PAGE);
  expect(response.ok()).toBe(true);
});

it('should work when navigating to data url', async ({ page, server }) => {
  const response = await page.goto('data:text/html,hello');
  expect(response).toBe(null);
});

it('should work when navigating to 404', async ({ page, server }) => {
  const response = await page.goto(server.PREFIX + '/not-found');
  expect(response.ok()).toBe(false);
  expect(response.status()).toBe(404);
});

it('should return last response in redirect chain', async ({ page, server }) => {
  server.setRedirect('/redirect/1.html', '/redirect/2.html');
  server.setRedirect('/redirect/2.html', '/redirect/3.html');
  server.setRedirect('/redirect/3.html', server.EMPTY_PAGE);
  const response = await page.goto(server.PREFIX + '/redirect/1.html');
  expect(response.ok()).toBe(true);
  expect(response.url()).toBe(server.EMPTY_PAGE);
});

it('should not leak listeners during navigation', async ({ page, server }) => {
  let warning = null;
  const warningHandler = w => warning = w;
  process.on('warning', warningHandler);
  for (let i = 0; i < 20; ++i)
    await page.goto(server.EMPTY_PAGE);
  process.off('warning', warningHandler);
  expect(warning).toBe(null);
});

it('should not leak listeners during bad navigation', async ({ page, server }) => {
  let warning = null;
  const warningHandler = w => warning = w;
  process.on('warning', warningHandler);
  for (let i = 0; i < 20; ++i)
    await page.goto('asdf').catch(e => {/* swallow navigation error */});
  process.off('warning', warningHandler);
  expect(warning).toBe(null);
});

it('should not leak listeners during 20 waitForNavigation', async ({ page, server }) => {
  let warning = null;
  const warningHandler = w => warning = w;
  process.on('warning', warningHandler);
  const promises = [...Array(20)].map(() => page.waitForNavigation());
  await page.goto(server.EMPTY_PAGE);
  await Promise.all(promises);
  process.off('warning', warningHandler);
  expect(warning).toBe(null);
});

it('should navigate to dataURL and not fire dataURL requests', async ({ page, server }) => {
  const requests = [];
  page.on('request', request => requests.push(request));
  const dataURL = 'data:text/html,<div>yo</div>';
  const response = await page.goto(dataURL);
  expect(response).toBe(null);
  expect(requests.length).toBe(0);
});

it('should navigate to URL with hash and fire requests without hash', async ({ page, server }) => {
  const requests = [];
  page.on('request', request => requests.push(request));
  const response = await page.goto(server.EMPTY_PAGE + '#hash');
  expect(response.status()).toBe(200);
  expect(response.url()).toBe(server.EMPTY_PAGE);
  expect(requests.length).toBe(1);
  expect(requests[0].url()).toBe(server.EMPTY_PAGE);
});

it('should work with self requesting page', async ({ page, server }) => {
  const response = await page.goto(server.PREFIX + '/self-request.html');
  expect(response.status()).toBe(200);
  expect(response.url()).toContain('self-request.html');
});

it('should fail when navigating and show the url at the error message', async function({ page, server, httpsServer }) {
  const url = httpsServer.PREFIX + '/redirect/1.html';
  let error = null;
  try {
    await page.goto(url);
  } catch (e) {
    error = e;
  }
  expect(error.message).toContain(url);
});

it('should be able to navigate to a page controlled by service worker', async ({ page, server, isElectron }) => {
  it.skip(isElectron);
  await page.goto(server.PREFIX + '/serviceworkers/fetch/sw.html');
  await page.evaluate(() => window['activationPromise']);
  await page.goto(server.PREFIX + '/serviceworkers/fetch/sw.html');
});

it('should send referer', async ({ page, server }) => {
  const [request1, request2] = await Promise.all([
    server.waitForRequest('/grid.html'),
    server.waitForRequest('/digits/1.png'),
    page.goto(server.PREFIX + '/grid.html', {
      referer: 'http://google.com/',
    }),
  ]);
  expect(request1.headers['referer']).toBe('http://google.com/');
  // Make sure subresources do not inherit referer.
  expect(request2.headers['referer']).toBe(server.PREFIX + '/grid.html');
  expect(page.url()).toBe(server.PREFIX + '/grid.html');
});

it('should reject referer option when setExtraHTTPHeaders provides referer', async ({ page, server }) => {
  await page.setExtraHTTPHeaders({ 'referer': 'http://microsoft.com/' });
  let error;
  await page.goto(server.PREFIX + '/grid.html', {
    referer: 'http://google.com/',
  }).catch(e => error = e);
  expect(error.message).toContain('"referer" is already specified as extra HTTP header');
  expect(error.message).toContain(server.PREFIX + '/grid.html');
});

it('should override referrer-policy', async ({ page, server }) => {
  server.setRoute('/grid.html', (req, res) => {
    res.setHeader('Referrer-Policy', 'no-referrer');
    server.serveFile(req, res);
  });
  const [request1, request2] = await Promise.all([
    server.waitForRequest('/grid.html'),
    server.waitForRequest('/digits/1.png'),
    page.goto(server.PREFIX + '/grid.html', {
      referer: 'http://microsoft.com/',
    }),
  ]);
  expect(request1.headers['referer']).toBe('http://microsoft.com/');
  // Make sure subresources do not inherit referer.
  expect(request2.headers['referer']).toBe(undefined);
  expect(page.url()).toBe(server.PREFIX + '/grid.html');
});

it('should fail when canceled by another navigation', async ({ page, server }) => {
  server.setRoute('/one-style.html', (req, res) => {});
  const failed = page.goto(server.PREFIX + '/one-style.html').catch(e => e);
  await server.waitForRequest('/one-style.html');
  await page.goto(server.PREFIX + '/empty.html');
  const error = await failed;
  expect(error.message).toBeTruthy();
});

it('should work with lazy loading iframes', async ({ page, server, isElectron, isAndroid }) => {
  it.fixme(isElectron);
  it.fixme(isAndroid);

  await page.goto(server.PREFIX + '/frames/lazy-frame.html');
  expect(page.frames().length).toBe(2);
});

it('should report raw buffer for main resource', async ({ page, server, browserName, platform }) => {
  it.fail(browserName === 'chromium', 'Chromium sends main resource as text');
  it.fail(browserName === 'webkit' && platform === 'win32', 'Same here');

  server.setRoute('/empty.html', (req, res) => {
    res.statusCode = 200;
    res.end(Buffer.from('Ü (lowercase ü)', 'utf-8'));
  });
  const response = await page.goto(server.PREFIX + '/empty.html');
  const body = await response.body();
  expect(body.toString()).toBe('Ü (lowercase ü)');
});

it('should not throw unhandled rejections on invalid url', async ({ page, server }) => {
  const e = await page.goto('https://www.youtube Panel Title.com/').catch(e => e);
  expect(e.toString()).toContain('Panel Title');
});

it('should not crash when RTCPeerConnection is used', async ({ page, server, browserName, platform }) => {
  it.fixme(browserName === 'webkit' && platform === 'darwin' && parseInt(os.release(), 10) === 18, 'Does not work on MacOS 10.14');
  server.setRoute('/rtc.html', (_, res) => {
    res.end(`
      <!DOCTYPE html>
      <html>
        <body>
          <script>
            window.RTCPeerConnection && new window.RTCPeerConnection({
              iceServers: []
            });
          </script>
        </body>
      </html>
`);
  });
  await page.goto(server.PREFIX + '/rtc.html');
  await page.evaluate(() => {
    // RTCPeerConnection is not present on WebKit Linux
    window.RTCPeerConnection && new window.RTCPeerConnection({
      iceServers: []
    });
  });
});

it('should properly wait for load', async ({ page, server, browserName }) => {
  it.fixme(browserName === 'webkit', 'WebKit has a bug where Page.frameStoppedLoading is sent too early.');
  server.setRoute('/slow.js', async (req, res) => {
    await new Promise(x => setTimeout(x, 100));
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    res.end(`window.results.push('slow module');export const foo = 'slow';`);
  });
  await page.goto(server.PREFIX + '/load-event/load-event.html');
  const results = await page.evaluate('window.results');
  expect(results).toEqual([
    'script tag after after module',
    'slow module',
    'module',
    'DOMContentLoaded',
    'load'
  ]);
});

it('should properly report window.stop()', async ({ page, server, browserName }) => {
  server.setRoute('/module.js', async (req, res) => void 0);
  await page.goto(server.PREFIX + '/window-stop.html');
});

it('should return from goto if new navigation is started', async ({ page, server, browserName }) => {
  it.fixme(browserName === 'webkit', 'WebKit has a bug where Page.frameStoppedLoading is sent too early.');
  server.setRoute('/slow.js', async (req, res) => void 0);
  let finished = false;
  const navigation = page.goto(server.PREFIX + '/load-event/load-event.html').then(r => {
    finished = true;
    return r;
  });
  await new Promise(r => setTimeout(r, 500));
  expect(finished).toBeFalsy();
  await page.goto(server.EMPTY_PAGE);
  expect((await navigation).status()).toBe(200);
});

it('should return when navigation is committed if commit is specified', async ({ page, server }) => {
  server.setRoute('/empty.html', (req, res) => {
    res.writeHead(200, {
      'content-type': 'text/html',
      'content-length': '8192'
    });
    // Write enought bytes of the body to trigge response received event.
    res.write('<title>' + 'A'.repeat(4100));
    res.uncork();
  });
  const response = await page.goto(server.EMPTY_PAGE, { waitUntil: 'commit' });
  expect(response.status()).toBe(200);
});
