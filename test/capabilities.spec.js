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

const {FFOX, CHROMIUM, WEBKIT, WIN, LINUX} = require('./utils').testOptions(browserType);

describe('Capabilities', function() {
  it.fail(WEBKIT && WIN)('Web Assembly should work', async function({page, server}) {
    await page.goto(server.PREFIX + '/wasm/table2.html');
    expect(await page.evaluate(() => loadTable())).toBe('42, 83');
  });

  it('WebSocket should work', async({page, server}) => {
    const value = await page.evaluate((port) => {
      let cb;
      const result = new Promise(f => cb = f);
      const ws = new WebSocket('ws://localhost:' + port + '/ws');
      ws.addEventListener('message', data => { ws.close(); cb(data.data); });
      ws.addEventListener('error', error => cb('Error'));
      return result;
    }, server.PORT);
    expect(value).toBe('incoming');
  });

  it('should respect CSP', async({page, server}) => {
    server.setRoute('/empty.html', async (req, res) => {
      res.setHeader('Content-Security-Policy', `script-src 'unsafe-inline';`);
      res.end(`
        <script>
          window.testStatus = 'SUCCESS';
          window.testStatus = eval("'FAILED'");
        </script>`);
    });

    await page.goto(server.EMPTY_PAGE);
    expect(await page.evaluate(() => window.testStatus)).toBe('SUCCESS');
  });
  fit.fail(WEBKIT && !LINUX)('should play video', async({page, server}) => {
    await page.goto(server.PREFIX + '/video.html');
    await page.$eval('video', v => v.play());
    await page.$eval('video', v => v.pause());
  });
});
