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

import { test, expect } from './cli-fixtures';

// Boots the dev React 18 fixture with the DevTools hook attached. The hook is
// installed via init script before the page loads, then we navigate (open)
// once with the hook already pending. After this helper returns, the page is
// ready for react-tree / react-inspect / react-suspense to inspect components.
async function setupReactApp(cli: (...args: string[]) => Promise<{ output: string; exitCode: number | undefined }>, version: '16' | '17' | '18', server: { PREFIX: string }) {
  await cli('open');
  await cli('react-devtools-install');
  await cli('goto', `${server.PREFIX}/reading-list/react${version}.html`);
}

test('vitals on a basic page', async ({ cli, server }) => {
  await cli('open', server.PREFIX);
  const { output, exitCode } = await cli('vitals');
  expect(exitCode).toBe(0);
  expect(output).toContain('# Page Load Profile');
  expect(output).toContain('## Core Web Vitals');
});

test('react-tree without install reports a clear error', async ({ cli, server }) => {
  await cli('open', server.PREFIX);
  const { output } = await cli('react-tree');
  expect(output).toContain('React DevTools hook not present');
});

test('react-devtools-install attaches the hook on the next navigation', async ({ cli, server }) => {
  await cli('open', server.PREFIX);
  const installed = await cli('react-devtools-install');
  expect(installed.output).toContain('React DevTools hook installed');
  await cli('goto', server.PREFIX);
  const probe = await cli('eval', '() => typeof window.__REACT_DEVTOOLS_GLOBAL_HOOK__');
  expect(probe.output).toContain('"object"');
});

test('react-tree on non-React page reports missing renderer', async ({ cli, server }) => {
  await cli('open');
  await cli('react-devtools-install');
  await cli('goto', server.PREFIX);
  const { output } = await cli('react-tree');
  expect(output).toContain('No React renderer attached');
});

for (const version of ['16', '17', '18'] as const) {
  test(`react-tree on reading-list/react${version} lists all named components`, async ({ cli, server }) => {
    await setupReactApp(cli, version, server);
    const { output, exitCode } = await cli('react-tree');
    expect(exitCode).toBe(0);
    // Every named component declared in the fixture appears in the tree.
    expect(output).toContain(' App');
    expect(output).toContain(' AppHeader');
    expect(output).toContain(' NewBook');
    expect(output).toContain(' BookList');
    expect(output).toContain(' BookItem');
    expect(output).toContain(' ButtonGrid');
    expect(output).toContain(' ColorButton');
    // Three BookItems and nine ColorButtons.
    expect((output.match(/ BookItem(\s|$)/g) ?? []).length).toBe(3);
    expect((output.match(/ ColorButton(\s|$)/g) ?? []).length).toBe(9);
  });
}

test('react-inspect surfaces props of a fiber by id', async ({ cli, server }) => {
  await setupReactApp(cli, '18', server);
  const { output: tree } = await cli('react-tree');
  const colorButtonLine = tree.split('\n').find(line => / ColorButton(\s|$)/.test(line));
  expect(colorButtonLine, 'tree has a ColorButton fiber').toBeDefined();
  const id = colorButtonLine!.split(' ')[1];

  const { output, exitCode } = await cli('react-inspect', id);
  expect(exitCode).toBe(0);
  expect(output).toContain('ColorButton');
  expect(output).toMatch(/color: "red"/);
  expect(output).toMatch(/enabled: true/);
  expect(output).toMatch(/nested:.*index: 0/s);
  expect(output).toMatch(/rendered by:.*App/);
});

test('react-inspect on missing id returns a clear error', async ({ cli, server }) => {
  await setupReactApp(cli, '18', server);
  const { output } = await cli('react-inspect', '999999');
  expect(output).toContain('not found');
});

test('react-suspense returns empty report when no boundaries', async ({ cli, server }) => {
  await setupReactApp(cli, '18', server);
  const { output, exitCode } = await cli('react-suspense');
  expect(exitCode).toBe(0);
  expect(output).toContain('No Suspense boundaries found');
});

test('react-tree --filename writes the report to a file', async ({ cli, server }) => {
  await setupReactApp(cli, '18', server);
  const { output, exitCode } = await cli('react-tree', '--filename=tree.md');
  expect(exitCode).toBe(0);
  // The CLI prints a markdown link with the relative file path when --filename is used.
  expect(output).toMatch(/\[React tree\]\(.*tree\.md\)/);
});

test('vitals --filename writes the report to a file', async ({ cli, server }) => {
  await cli('open', server.PREFIX);
  const { output, exitCode } = await cli('vitals', '--filename=vitals.md');
  expect(exitCode).toBe(0);
  expect(output).toMatch(/\[Web vitals\]\(.*vitals\.md\)/);
});
