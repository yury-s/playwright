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

import { test, expect } from './fixtures';

test('browser_web_vitals returns formatted metrics', async ({ client, server }) => {
  await client.callTool({ name: 'browser_navigate', arguments: { url: server.HELLO_WORLD } });
  expect(await client.callTool({ name: 'browser_web_vitals', arguments: {} })).toHaveResponse({
    result: expect.stringContaining('# Page Load Profile'),
  });
});

test('browser_react_tree without hook returns helpful error', async ({ client, server }) => {
  await client.callTool({ name: 'browser_navigate', arguments: { url: server.HELLO_WORLD } });
  expect(await client.callTool({ name: 'browser_react_tree', arguments: {} })).toHaveResponse({
    isError: true,
    error: expect.stringContaining('React DevTools hook not present'),
  });
});

test('browser_react_devtools_install registers hook for future loads', async ({ client, server }) => {
  await client.callTool({ name: 'browser_navigate', arguments: { url: server.HELLO_WORLD } });
  expect(await client.callTool({ name: 'browser_react_devtools_install', arguments: {} })).toHaveResponse({
    result: expect.stringContaining('React DevTools hook installed'),
  });
  await client.callTool({ name: 'browser_navigate', arguments: { url: server.HELLO_WORLD } });
  expect(await client.callTool({
    name: 'browser_evaluate',
    arguments: { function: '() => typeof window.__REACT_DEVTOOLS_GLOBAL_HOOK__' },
  })).toHaveResponse({
    result: '"object"',
  });
});

test('browser_react_tree on non-React page reports missing renderer', async ({ client, server }) => {
  await client.callTool({ name: 'browser_react_devtools_install', arguments: {} });
  await client.callTool({ name: 'browser_navigate', arguments: { url: server.HELLO_WORLD } });
  expect(await client.callTool({ name: 'browser_react_tree', arguments: {} })).toHaveResponse({
    isError: true,
    error: expect.stringContaining('No React renderer attached'),
  });
});

// Tests below use the existing reading-list React fixtures.
// Layout: AppHeader, NewBook, BookList(BookItem*3), ButtonGrid(ColorButton*9 via React.memo).
async function setupReactApp(client: any, server: any, version: '16' | '17' | '18') {
  await client.callTool({ name: 'browser_react_devtools_install', arguments: {} });
  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: `${server.PREFIX}/reading-list/react${version}.html` },
  });
}

for (const version of ['16', '17', '18'] as const) {
  test(`browser_react_tree on reading-list/react${version} lists named components`, async ({ client, server }) => {
    await setupReactApp(client, server, version);
    const response = await client.callTool({ name: 'browser_react_tree', arguments: {} });
    const tree = (response.content[0] as { text: string }).text;

    // Every named component declared in the fixture should appear in the tree.
    expect(tree).toContain(' App');
    expect(tree).toContain(' AppHeader');
    expect(tree).toContain(' NewBook');
    expect(tree).toContain(' BookList');
    expect(tree).toContain(' BookItem');
    expect(tree).toContain(' ButtonGrid');
    expect(tree).toContain(' ColorButton');

    // BookList renders three books via .map(book => <li key=...><BookItem .../></li>),
    // so we should see three BookItem nodes.
    const bookItemCount = (tree.match(/ BookItem(\s|$)/g) ?? []).length;
    expect(bookItemCount).toBe(3);

    // ButtonGrid renders nine ColorButtons.
    const colorButtonCount = (tree.match(/ ColorButton(\s|$)/g) ?? []).length;
    expect(colorButtonCount).toBe(9);
  });
}

test('browser_react_tree hides host DOM elements by default', async ({ client, server }) => {
  await setupReactApp(client, server, '18');
  const tree = ((await client.callTool({ name: 'browser_react_tree', arguments: {} })).content[0] as { text: string }).text;
  // Components are present.
  expect(tree).toContain(' App');
  expect(tree).toContain(' BookList');
  expect(tree).toContain(' ColorButton');
  // Host elements rendered by those components are not.
  expect(tree).not.toMatch(/^\s+div #/m);
  expect(tree).not.toMatch(/^\s+button #/m);
  expect(tree).not.toMatch(/^\s+h1 #/m);
});

test('browser_react_tree withProps shows a compact props preview per component', async ({ client, server }) => {
  await setupReactApp(client, server, '18');
  const tree = ((await client.callTool({ name: 'browser_react_tree', arguments: { withProps: true } })).content[0] as { text: string }).text;
  // AppHeader is rendered with bookCount=3 by App.
  expect(tree).toMatch(/AppHeader #\d+ \{[^}]*bookCount: 3/);
  // Each BookItem carries its book name as a prop.
  expect(tree).toMatch(/BookItem #\d+ \{ name: "Pride and Prejudice" \}/);
  // ColorButton props match the fixture's nested object shape.
  expect(tree).toMatch(/ColorButton #\d+ \{ color: "red", enabled: true, nested: \{index: 0/);
  // children prop is filtered out — the tree visualizes children directly.
  expect(tree).not.toMatch(/children:/);
});

test('browser_react_tree without withProps does not include any prop previews', async ({ client, server }) => {
  await setupReactApp(client, server, '18');
  const tree = ((await client.callTool({ name: 'browser_react_tree', arguments: {} })).content[0] as { text: string }).text;
  // No "{ ... }" preview after a component name.
  expect(tree).not.toMatch(/#\d+ \{/);
});

test('browser_react_tree includeHosts shows host DOM elements', async ({ client, server }) => {
  await setupReactApp(client, server, '18');
  const tree = ((await client.callTool({ name: 'browser_react_tree', arguments: { includeHosts: true } })).content[0] as { text: string }).text;
  // Hosts now appear under their owning components.
  expect(tree).toMatch(/^\s+div #/m);
  expect(tree).toMatch(/^\s+button #/m);
  expect(tree).toMatch(/^\s+h1 #/m);
});

test('browser_react_inspect returns props for a fiber', async ({ client, server }) => {
  await setupReactApp(client, server, '18');

  const tree = ((await client.callTool({ name: 'browser_react_tree', arguments: {} })).content[0] as { text: string }).text;

  // Find the first ColorButton fiber id from the tree dump.
  const match = tree.split('\n').find(line => / ColorButton(\s|$|#)/.test(line));
  expect(match).toBeDefined();
  const id = Number(match!.match(/#(\d+)/)![1]);
  expect(Number.isFinite(id)).toBe(true);

  const inspect = await client.callTool({ name: 'browser_react_inspect', arguments: { id } });
  const text = (inspect.content[0] as { text: string }).text;

  // The first ColorButton has color=red, enabled=true, nested.index=0.
  expect(text).toContain('ColorButton');
  expect(text).toMatch(/color: "red"/);
  expect(text).toMatch(/enabled: true/);
  expect(text).toMatch(/nested:.*index: 0/s);
  // Owner chain back to App via ButtonGrid.
  expect(text).toMatch(/rendered by:.*App/);
});

test('browser_react_inspect surfaces class component state', async ({ client, server }) => {
  await setupReactApp(client, server, '18');

  const tree = ((await client.callTool({ name: 'browser_react_tree', arguments: {} })).content[0] as { text: string }).text;
  const appLine = tree.split('\n').find(line => / App(\s|$|#)/.test(line));
  expect(appLine).toBeDefined();
  const id = Number(appLine!.match(/#(\d+)/)![1]);

  const inspect = await client.callTool({ name: 'browser_react_inspect', arguments: { id } });
  const text = (inspect.content[0] as { text: string }).text;

  expect(text).toContain('App');
  // App.state.books holds three books at initial render.
  expect(text).toMatch(/state:[\s\S]*books:/);
  expect(text).toMatch(/Pride and Prejudice/);
});

test('browser_react_tree refreshes after interaction adds a BookItem', async ({ client, server }) => {
  await setupReactApp(client, server, '18');

  const before = ((await client.callTool({ name: 'browser_react_tree', arguments: {} })).content[0] as { text: string }).text;
  const bookItemsBefore = (before.match(/ BookItem(\s|$)/g) ?? []).length;
  expect(bookItemsBefore).toBe(3);

  // Add a new book via App.onNewBook → setState. We bypass the input typing
  // and call the existing "new book" button after seeding state directly,
  // to keep the test focused on the tree rather than DOM input.
  await client.callTool({
    name: 'browser_evaluate',
    arguments: {
      function: `() => {
        const root = document.querySelector('#root');
        const input = root.querySelector('input');
        const button = root.querySelector('button');
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, 'Brave New World');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        button.click();
      }`,
    },
  });

  const after = ((await client.callTool({ name: 'browser_react_tree', arguments: {} })).content[0] as { text: string }).text;
  const bookItemsAfter = (after.match(/ BookItem(\s|$)/g) ?? []).length;
  expect(bookItemsAfter).toBe(4);
});

test('browser_react_suspense returns empty report when no boundaries', async ({ client, server }) => {
  await setupReactApp(client, server, '18');
  expect(await client.callTool({ name: 'browser_react_suspense', arguments: {} })).toHaveResponse({
    result: expect.stringContaining('No Suspense boundaries found'),
  });
});

test('browser_react_inspect on missing id reports a clear error', async ({ client, server }) => {
  await setupReactApp(client, server, '18');
  expect(await client.callTool({ name: 'browser_react_inspect', arguments: { id: 999999 } })).toHaveResponse({
    isError: true,
    error: expect.stringContaining('not found'),
  });
});
