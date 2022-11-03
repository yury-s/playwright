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

import http from 'http';
import path from 'path';
import { test, expect } from './playwright-test-fixtures';

const SIMPLE_SERVER_PATH = path.join(__dirname, 'assets', 'simple-server.js');
const SIMPLE_SERVER_THAT_IGNORES_SIGTERM_PATH = path.join(__dirname, 'assets', 'simple-server-ignores-sigterm.js');

test('should create a server', async ({ runInlineTest }, { workerIndex }) => {
  const port = workerIndex + 10500;
  const result = await runInlineTest({
    'test.spec.ts': `
      const { test } = pwt;
      test('connect to the server via the baseURL', async ({baseURL, page}) => {
        await page.goto('/hello');
        await page.waitForURL('/hello');
        expect(page.url()).toBe('http://localhost:${port}/hello');
        expect(await page.textContent('body')).toBe('hello');
      });
    `,
    'playwright.config.ts': `
      module.exports = {
        webServer: {
          command: 'node ${JSON.stringify(SIMPLE_SERVER_PATH)} ${port}',
          port: ${port},
        },
        globalSetup: 'globalSetup.ts',
        globalTeardown: 'globalTeardown.ts',
      };
    `,
    'globalSetup.ts': `
      const { expect } = pwt;
      module.exports = async (config) => {
        expect(config.webServer.port, "For backwards compatibility reasons, we ensure this shows up.").toBe(${port});
        const http = require("http");
        const response = await new Promise(resolve => {
          const request = http.request("http://localhost:${port}/hello", resolve);
          request.end();
        })
        console.log('globalSetup-status-'+response.statusCode)
        return async () => {
          const response = await new Promise(resolve => {
            const request = http.request("http://localhost:${port}/hello", resolve);
            request.end();
          })
          console.log('globalSetup-teardown-status-'+response.statusCode)
        };
      };
    `,
    'globalTeardown.ts': `
      module.exports = async () => {
        const http = require("http");
        const response = await new Promise(resolve => {
          const request = http.request("http://localhost:${port}/hello", resolve);
          request.end();
        })
        console.log('globalTeardown-status-'+response.statusCode)
      };
    `,
  });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
  expect(result.output).not.toContain('[WebServer] listening');
  expect(result.output).toContain('[WebServer] error from server');
  expect(result.report.suites[0].specs[0].tests[0].results[0].status).toContain('passed');

  const expectedLogMessages = ['globalSetup-status-200', 'globalSetup-teardown-status', 'globalTeardown-status-200'];
  const actualLogMessages = expectedLogMessages.map(log => ({
    log,
    index: result.output.indexOf(log),
  })).sort((a, b) => a.index - b.index).filter(l => l.index !== -1).map(l => l.log);
  expect(actualLogMessages).toStrictEqual(expectedLogMessages);
});

test('should create a server with environment variables', async ({ runInlineTest }, { workerIndex }) => {
  const port = workerIndex + 10500;
  const result = await runInlineTest({
    'test.spec.ts': `
      const { test } = pwt;
      test('connect to the server', async ({baseURL, page}) => {
        expect(baseURL).toBe('http://localhost:${port}');
        await page.goto(baseURL + '/env-FOO');
        expect(await page.textContent('body')).toBe('BAR');
      });
    `,
    'playwright.config.ts': `
      module.exports = {
        webServer: {
          command: 'node ${JSON.stringify(SIMPLE_SERVER_PATH)} ${port}',
          port: ${port},
          env: {
            'FOO': 'BAR',
          }
        }
      };
    `,
  }, {}, { DEBUG: 'pw:webserver' });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
  expect(result.output).toContain('[WebServer] listening');
  expect(result.output).toContain('[WebServer] error from server');
  expect(result.report.suites[0].specs[0].tests[0].results[0].status).toContain('passed');
});

test('should default cwd to config directory', async ({ runInlineTest }, testInfo) => {
  const port = testInfo.workerIndex + 10500;
  const configDir = testInfo.outputPath('foo');
  const relativeSimpleServerPath = path.relative(configDir, SIMPLE_SERVER_PATH);
  const result = await runInlineTest({
    'foo/test.spec.ts': `
      const { test } = pwt;
      test('connect to the server', async ({ baseURL }) => {
        expect(baseURL).toBe('http://localhost:${port}');
      });
    `,
    'foo/playwright.config.ts': `
      module.exports = {
        webServer: {
          command: 'node ${JSON.stringify(relativeSimpleServerPath)} ${port}',
          port: ${port},
        }
      };
    `,
  }, {}, { DEBUG: 'pw:webserver' }, {
    cwd: 'foo'
  });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
  expect(result.output).toContain('[WebServer] listening');
  expect(result.output).toContain('[WebServer] error from server');
});

test('should resolve cwd wrt config directory', async ({ runInlineTest }, testInfo) => {
  const port = testInfo.workerIndex + 10500;
  const testdir = testInfo.outputPath();
  const relativeSimpleServerPath = path.relative(testdir, SIMPLE_SERVER_PATH);
  const result = await runInlineTest({
    'foo/test.spec.ts': `
      const { test } = pwt;
      test('connect to the server', async ({ baseURL }) => {
        expect(baseURL).toBe('http://localhost:${port}');
      });
    `,
    'foo/playwright.config.ts': `
      module.exports = {
        webServer: {
          command: 'node ${JSON.stringify(relativeSimpleServerPath)} ${port}',
          port: ${port},
          cwd: '..',
        }
      };
    `,
  }, {}, { DEBUG: 'pw:webserver' }, {
    cwd: 'foo'
  });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
  expect(result.output).toContain('[WebServer] listening');
  expect(result.output).toContain('[WebServer] error from server');
});


test('should create a server with url', async ({ runInlineTest }, { workerIndex }) => {
  const port = workerIndex + 10500;
  const result = await runInlineTest({
    'test.spec.ts': `
      const { test } = pwt;
      test('connect to the server', async ({baseURL, page}) => {
        expect(baseURL).toBe(undefined);
        await page.goto('http://localhost:${port}/ready');
        expect(await page.textContent('body')).toBe('hello');
      });
    `,
    'playwright.config.ts': `
      module.exports = {
        webServer: {
          command: 'node ${JSON.stringify(path.join(__dirname, 'assets', 'simple-server-with-ready-route.js'))} ${port}',
          url: 'http://localhost:${port}/ready'
        }
      };
    `,
  });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
  expect(result.report.suites[0].specs[0].tests[0].results[0].status).toContain('passed');
});

test('should time out waiting for a server', async ({ runInlineTest }, { workerIndex }) => {
  const port = workerIndex + 10500;
  const result = await runInlineTest({
    'test.spec.ts': `
      const { test } = pwt;
      test('connect to the server', async ({baseURL, page}) => {
        expect(baseURL).toBe('http://localhost:${port}');
        await page.goto(baseURL + '/hello');
        expect(await page.textContent('body')).toBe('hello');
      });
    `,
    'playwright.config.ts': `
      module.exports = {
        webServer: {
          command: 'node ${JSON.stringify(SIMPLE_SERVER_PATH)} ${port} 1000',
          port: ${port},
          timeout: 100,
        }
      };
    `,
  });
  expect(result.exitCode).toBe(1);
  expect(result.output).toContain(`Timed out waiting 100ms from config.webServer.`);
});

test('should time out waiting for a server with url', async ({ runInlineTest }, { workerIndex }) => {
  const port = workerIndex + 10500;
  const result = await runInlineTest({
    'test.spec.ts': `
      const { test } = pwt;
      test('connect to the server', async ({baseURL, page}) => {
        expect(baseURL).toBe('http://localhost:${port}/ready');
        await page.goto(baseURL);
        expect(await page.textContent('body')).toBe('hello');
      });
    `,
    'playwright.config.ts': `
      module.exports = {
        webServer: {
          command: 'node ${JSON.stringify(path.join(__dirname, 'assets', 'simple-server-with-ready-route.js'))} ${port}',
          url: 'http://localhost:${port}/ready',
          timeout: 300,
        }
      };
    `,
  });
  expect(result.exitCode).toBe(1);
  expect(result.output).toContain(`Timed out waiting 300ms from config.webServer.`);
});

test('should be able to specify the baseURL without the server', async ({ runInlineTest }, { workerIndex }) => {
  const port = workerIndex + 10500;
  const server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
    res.end('<html><body>hello</body></html>');
  });
  await new Promise<void>(resolve => server.listen(port, resolve));
  const result = await runInlineTest({
    'test.spec.ts': `
      const { test } = pwt;
      test('connect to the server', async ({baseURL, page}) => {
        expect(baseURL).toBe('http://localhost:${port}');
        await page.goto(baseURL + '/hello');
        expect(await page.textContent('body')).toBe('hello');
      });
    `,
    'playwright.config.ts': `
      module.exports = {
        use: {
          baseURL: 'http://localhost:${port}',
        }
      };
    `,
  });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
  expect(result.report.suites[0].specs[0].tests[0].results[0].status).toContain('passed');
  await new Promise(resolve => server.close(resolve));
});

test('should be able to specify a custom baseURL with the server', async ({ runInlineTest }, { workerIndex }) => {
  const customWebServerPort = workerIndex + 10500;
  const webServerPort = customWebServerPort + 1;
  const server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
    res.end('<html><body>hello</body></html>');
  });
  await new Promise<void>(resolve => server.listen(customWebServerPort, resolve));
  const result = await runInlineTest({
    'test.spec.ts': `
      const { test } = pwt;
      test('connect to the server', async ({baseURL, page}) => {
        expect(baseURL).toBe('http://localhost:${customWebServerPort}');
        await page.goto(baseURL + '/hello');
        expect(await page.textContent('body')).toBe('hello');
      });
    `,
    'playwright.config.ts': `
      module.exports = {
        webServer: {
          command: 'node ${JSON.stringify(SIMPLE_SERVER_PATH)} ${webServerPort}',
          port: ${webServerPort},
        },
        use: {
          baseURL: 'http://localhost:${customWebServerPort}',
        }
      };
    `,
  });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
  expect(result.report.suites[0].specs[0].tests[0].results[0].status).toContain('passed');
  await new Promise(resolve => server.close(resolve));
});

test('should be able to use an existing server when reuseExistingServer:true', async ({ runInlineTest }, { workerIndex }) => {
  const port = workerIndex + 10500;
  const server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
    res.end('<html><body>hello</body></html>');
  });
  await new Promise<void>(resolve => server.listen(port, resolve));
  const result = await runInlineTest({
    'test.spec.ts': `
      const { test } = pwt;
      test('connect to the server via the baseURL', async ({baseURL, page}) => {
        await page.goto('/hello');
        await page.waitForURL('/hello');
        expect(page.url()).toBe('http://localhost:${port}/hello');
        expect(await page.textContent('body')).toBe('hello');
      });
    `,
    'playwright.config.ts': `
      module.exports = {
        webServer: {
          command: 'node ${JSON.stringify(SIMPLE_SERVER_PATH)} ${port}',
          port: ${port},
          reuseExistingServer: true,
        }
      };
    `,
  });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
  expect(result.output).not.toContain('[WebServer] ');
  expect(result.report.suites[0].specs[0].tests[0].results[0].status).toContain('passed');
  await new Promise(resolve => server.close(resolve));
});

test('should throw when a server is already running on the given port and strict is true', async ({ runInlineTest }, { workerIndex }) => {
  const port = workerIndex + 10500;
  const server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
    res.end('<html><body>hello</body></html>');
  });
  await new Promise<void>(resolve => server.listen(port, resolve));
  const result = await runInlineTest({
    'test.spec.ts': `
      const { test } = pwt;
      test('connect to the server via the baseURL', async ({baseURL, page}) => {
        await page.goto('/hello');
        await page.waitForURL('/hello');
        expect(page.url()).toBe('http://localhost:${port}/hello');
        expect(await page.textContent('body')).toBe('hello');
      });
    `,
    'playwright.config.ts': `
      module.exports = {
        webServer: {
          command: 'node ${JSON.stringify(SIMPLE_SERVER_PATH)} ${port}',
          port: ${port},
          reuseExistingServer: false,
        }
      };
    `,
  });
  expect(result.exitCode).toBe(1);
  expect(result.output).toContain(`http://localhost:${port} is already used, make sure that nothing is running on the port/url`);
  await new Promise(resolve => server.close(resolve));
});

for (const host of ['localhost', '127.0.0.1', '0.0.0.0']) {
  test(`should detect the server if a web-server is already running on ${host}`, async ({ runInlineTest }, { workerIndex }) => {
    const port = workerIndex + 10500;
    const server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
      res.end('<html><body>hello</body></html>');
    });
    await new Promise<void>(resolve => server.listen(port, host, resolve));
    try {
      const result = await runInlineTest({
        'test.spec.ts': `
      const { test } = pwt;
      test('connect to the server via the baseURL', async ({baseURL, page}) => {
        await page.goto('/hello');
        expect(await page.textContent('body')).toBe('hello');
      });
    `,
        'playwright.config.ts': `
      module.exports = {
        webServer: {
          command: 'node -e "process.exit(1)"',
          port: ${port},
          reuseExistingServer: false,
        }
      };
    `,
      });
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain(`http://localhost:${port} is already used, make sure that nothing is running on the port/url`);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
}

test(`should support self signed certificate`, async ({ runInlineTest, httpsServer }) => {
  const result = await runInlineTest({
    'test.spec.js': `
      const { test } = pwt;
      test('pass', async ({}) => { });
    `,
    'playwright.config.js': `
      module.exports = {
        webServer: {
          url: '${httpsServer.EMPTY_PAGE}',
          ignoreHTTPSErrors: true,
          reuseExistingServer: true,
        },
      };
    `,
  });
  expect(result.exitCode).toBe(0);
});

test('should send Accept header', async ({ runInlineTest, server }) => {
  let acceptHeader: string | undefined | null = null;
  server.setRoute('/hello', (req, res) => {
    if (acceptHeader === null) acceptHeader = req.headers.accept;
    res.end('<html><body>hello</body></html>');
  });
  const result = await runInlineTest({
    'test.spec.ts': `
      const { test } = pwt;
      test('connect to the server', async ({baseURL, page}) => {
        await page.goto('http://localhost:${server.PORT}/hello');
        expect(await page.textContent('body')).toBe('hello');
      });
    `,
    'playwright.config.ts': `
      module.exports = {
        webServer: {
          command: 'node ${JSON.stringify(SIMPLE_SERVER_PATH)} ${server.PORT}',
          url: 'http://localhost:${server.PORT}/hello',
          reuseExistingServer: true,
        }
      };
    `,
  });
  expect(result.exitCode).toBe(0);
  expect(acceptHeader).toBe('*/*');
});

test('should create multiple servers', async ({ runInlineTest }, { workerIndex }) => {
  const port = workerIndex + 10500;
  const result = await runInlineTest({
    'test.spec.ts': `
        const { test } = pwt;

        test('connect to the server', async ({page}) => {
          await page.goto('http://localhost:${port}/port');
          await page.locator('text=${port}');

          await page.goto('http://localhost:${port + 1}/port');
          await page.locator('text=${port + 1}');
        });
      `,
    'playwright.config.ts': `
        module.exports = {
          webServer: [
            {
              command: 'node ${JSON.stringify(SIMPLE_SERVER_PATH)} ${port}',
              url: 'http://localhost:${port}/port',
            },
            {
              command: 'node ${JSON.stringify(SIMPLE_SERVER_PATH)} ${port + 1}',
              url: 'http://localhost:${port + 1}/port',
            }
          ],
          globalSetup: 'globalSetup.ts',
          globalTeardown: 'globalTeardown.ts',
        };
        `,
    'globalSetup.ts': `
        const { expect } = pwt;
        module.exports = async (config) => {
          expect(config.webServer, "The public API defines this type as singleton or null, so if using array style we fallback to null to avoid having the type lie to the user.").toBe(null);
          const http = require("http");
          const response = await new Promise(resolve => {
            const request = http.request("http://localhost:${port}/hello", resolve);
            request.end();
          })
          console.log('globalSetup-status-'+response.statusCode)
          return async () => {
            const response = await new Promise(resolve => {
              const request = http.request("http://localhost:${port}/hello", resolve);
              request.end();
            })
            console.log('globalSetup-teardown-status-'+response.statusCode)
          };
        };
        `,
    'globalTeardown.ts': `
        module.exports = async () => {
          const http = require("http");
          const response = await new Promise(resolve => {
            const request = http.request("http://localhost:${port}/hello", resolve);
            request.end();
          })
          console.log('globalTeardown-status-'+response.statusCode)
        };
        `,
  }, undefined, { DEBUG: 'pw:webserver' });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
  expect(result.output).toContain('[WebServer] listening');
  expect(result.output).toContain('[WebServer] error from server');
  expect(result.output).toContain('passed');

  const expectedLogMessages = ['globalSetup-status-200', 'globalSetup-teardown-status', 'globalTeardown-status-200'];
  const actualLogMessages = expectedLogMessages.map(log => ({
    log,
    index: result.output.indexOf(log),
  })).sort((a, b) => a.index - b.index).filter(l => l.index !== -1).map(l => l.log);
  expect(actualLogMessages).toStrictEqual(expectedLogMessages);
});

test.describe('baseURL with plugins', () => {
  test('plugins do not set it', async ({ runInlineTest }, { workerIndex }) => {
    const port = workerIndex + 10500;
    const result = await runInlineTest({
      'test.spec.ts': `
          import { webServer } from '@playwright/test/lib/plugins';
          const { test, _addRunnerPlugin } = pwt;
          _addRunnerPlugin(webServer({
            command: 'node ${JSON.stringify(SIMPLE_SERVER_PATH)} ${port}',
            url: 'http://localhost:${port}/port',
          }));
          test('connect to the server', async ({baseURL, page}) => {
            expect(baseURL).toBeUndefined();
          });
      `,
      'playwright.config.ts': `module.exports = {};`,
    }, undefined, { DEBUG: 'pw:webserver' });
    expect(result.exitCode).toBe(0);
    expect(result.passed).toBe(1);
  });

  test('legacy config sets it alongside plugin', async ({ runInlineTest }, { workerIndex }) => {
    const port = workerIndex + 10500;
    const result = await runInlineTest({
      'test.spec.ts': `
          import { webServer } from '@playwright/test/lib/plugins';
          const { test, _addRunnerPlugin } = pwt;
          _addRunnerPlugin(webServer({
            command: 'node ${JSON.stringify(SIMPLE_SERVER_PATH)} ${port + 1}',
            url: 'http://localhost:${port + 1}/port'
          }));
          test('connect to the server', async ({baseURL, page}) => {
            expect(baseURL).toBe('http://localhost:${port}');
          });
        `,
      'playwright.config.ts': `
          module.exports = {
            webServer: {
              command: 'node ${JSON.stringify(SIMPLE_SERVER_PATH)} ${port}',
              port: ${port},
            }
          };
          `,
    }, undefined, { DEBUG: 'pw:webserver' });
    expect(result.exitCode).toBe(0);
    expect(result.passed).toBe(1);
  });
});

test('should treat 3XX as available server', async ({ runInlineTest }, { workerIndex }) => {
  const port = workerIndex + 10500;
  const result = await runInlineTest({
    'test.spec.ts': `
      const { test } = pwt;
      test('pass', async ({}) => {});
    `,
    'playwright.config.ts': `
      module.exports = {
        webServer: {
          command: 'node ${JSON.stringify(SIMPLE_SERVER_PATH)} ${port}',
          url: 'http://localhost:${port}/redirect',
        }
      };
    `,
  }, {}, { DEBUG: 'pw:webserver' });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
  expect(result.output).toContain('[WebServer] listening');
  expect(result.output).toContain('[WebServer] error from server');
});

test('should be able to kill process that ignores SIGTERM', async ({ runInlineTest }, { workerIndex }) => {
  test.skip(process.platform === 'win32', 'there is no SIGTERM on Windows');
  const port = workerIndex + 42500;
  const result = await runInlineTest({
    'test.spec.ts': `
      const { test } = pwt;
      test('pass', async ({}) => {});
    `,
    'playwright.config.ts': `
      module.exports = {
        webServer: {
          command: 'node ${JSON.stringify(SIMPLE_SERVER_THAT_IGNORES_SIGTERM_PATH)} ${port}',
          port: ${port},
          timeout: 1000,
        }
      };
    `,
  }, {}, { DEBUG: 'pw:webserver' });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
  console.log(result.output);
  expect(result.output).toContain('[WebServer] listening');
  expect(result.output).toContain('[WebServer] received SIGTERM - ignoring');
});
