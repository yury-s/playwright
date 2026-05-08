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

import fs from 'fs';

import * as z from 'zod';

import { libPath } from '../../package';
import { defineTabTool } from './tool';
import * as rawReactDevtoolsSource from '../../generated/reactDevtoolsSource';

import type { Tab } from './tab';
import type { Response } from './response';
import type { InspectFiberResult, SuspenseBoundary, TreeNode } from '../../../../injected/src/reactDevtools';

const INSTALL_HOOK_JS = fs.readFileSync(libPath('tools', 'backend', 'installHook.js'), 'utf8');
const REACT_DEVTOOLS_SOURCE = rawReactDevtoolsSource.source;
const HOOK_MISSING_MESSAGE = 'React DevTools hook not present. Run browser_react_devtools_install and reload the page.';

function evaluateExpression(method: string, args: string = ''): string {
  // The bundled source populates `module.exports.ReactDevtools` with the class.
  // We new it up and call the requested method, returning its (possibly async) result.
  return `(() => {
    const module = { exports: {} };
    ${REACT_DEVTOOLS_SOURCE};
    const script = new (module.exports.ReactDevtools())();
    return script.${method}(${args});
  })()`;
}

async function ensureHookOrInstall(tab: Tab, response: Response): Promise<boolean> {
  const present = await tab.page.evaluate('!!window.__REACT_DEVTOOLS_GLOBAL_HOOK__').catch(() => false);
  if (present)
    return true;
  const ctx = await tab.context.ensureBrowserContext();
  await ctx.addInitScript({ content: INSTALL_HOOK_JS });
  response.addError(HOOK_MISSING_MESSAGE + ' (Hook init script has been registered for future page loads.)');
  return false;
}

const reactDevtoolsInstall = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_react_devtools_install',
    title: 'Install React DevTools hook',
    description: 'Register the React DevTools hook as an init script on the current browser context. The hook is required by the other browser_react_* tools and must be installed before React boots, so reload the page after running this.',
    inputSchema: z.object({}),
    type: 'action',
  },

  handle: async (tab, params, response) => {
    const ctx = await tab.context.ensureBrowserContext();
    await ctx.addInitScript({ content: INSTALL_HOOK_JS });
    response.addTextResult('React DevTools hook installed for this browser context. Reload the page (browser_navigate or browser_navigate_reload) so the hook attaches before React boots.');
  },
});

// ElementType code from react-devtools-shared/src/frontend/types.js. We only
// care about the host-component case here for filtering; the full set lives in
// packages/injected/src/reactDevtoolsConstants.ts.
const ELEMENT_TYPE_HOST_COMPONENT = 7;

function formatTree(nodes: TreeNode[], includeHosts: boolean): string {
  const childrenByParent = new Map<number, TreeNode[]>();
  for (const n of nodes) {
    if (!childrenByParent.has(n.parent))
      childrenByParent.set(n.parent, []);
    childrenByParent.get(n.parent)!.push(n);
  }
  const ids = new Set(nodes.map(n => n.id));
  const roots = nodes.filter(n => !ids.has(n.parent));
  const lines: string[] = [
    '# React component tree',
    '# Format: <indent><name> #<id> [key="..."]; indent reflects component depth.',
    '# Use browser_react_inspect with the id for props/state/hooks. IDs are valid until the next navigation.',
  ];
  if (!includeHosts)
    lines.push('# Host DOM elements (div, span, svg, ...) are hidden. Pass include-hosts to show them.');

  function emit(node: TreeNode, depth: number) {
    const skip = !includeHosts && node.type === ELEMENT_TYPE_HOST_COMPONENT;
    if (!skip) {
      const indent = '  '.repeat(depth);
      const key = node.key ? ` key=${JSON.stringify(node.key)}` : '';
      const props = node.propsPreview ? ` { ${node.propsPreview} }` : '';
      lines.push(`${indent}${node.name ?? '(anonymous)'} #${node.id}${key}${props}`);
    }
    // When skipping a host, descend at the same depth so the visible component
    // tree stays connected (host children remain under the host's parent).
    const childDepth = skip ? depth : depth + 1;
    for (const child of childrenByParent.get(node.id) ?? [])
      emit(child, childDepth);
  }
  for (const root of roots)
    emit(root, 0);
  return lines.join('\n');
}

const reactTree = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_react_tree',
    title: 'React component tree',
    description: 'Walk the React fiber tree via the DevTools hook and return the component hierarchy. Requires browser_react_devtools_install to have been run before the page loaded.',
    inputSchema: z.object({
      includeHosts: z.boolean().optional().describe('Include host DOM elements (div, span, svg, etc.) in the tree. Defaults to false; the React component graph is much shorter and more readable without them.'),
      withProps: z.boolean().optional().describe('Show a compact props preview after each component, e.g. " { name: \\"World\\", count: 3 }". Calls inspectElement per fiber, so this is slower than a plain tree.'),
      filename: z.string().optional().describe('Save tree to a markdown file instead of returning it inline.'),
    }),
    type: 'readOnly',
  },

  handle: async (tab, params, response) => {
    if (!(await ensureHookOrInstall(tab, response)))
      return;
    try {
      const args = params.withProps ? '{ withProps: true }' : '';
      const nodes = await tab.page.evaluate<TreeNode[]>(evaluateExpression('tree', args));
      await response.addResult('React tree', formatTree(nodes, !!params.includeHosts), { prefix: 'react-tree', ext: 'md', suggestedFilename: params.filename });
    } catch (e) {
      response.addError(e instanceof Error ? e.message : String(e));
    }
  },
});

const reactClick = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_react_click',
    title: 'Click a React component by fiber id',
    description: 'Resolve a fiber id from browser_react_tree to its host DOM element and click it. Goes through the standard Playwright click path (actionability, real events). For components that render multiple host elements, the first is clicked.',
    inputSchema: z.object({
      id: z.number().int().describe('Fiber id from browser_react_tree.'),
      doubleClick: z.boolean().optional().describe('Whether to perform a double click instead of a single click.'),
      button: z.enum(['left', 'right', 'middle']).optional().describe('Mouse button. Defaults to left.'),
    }),
    type: 'input',
  },

  handle: async (tab, params, response) => {
    if (!(await ensureHookOrInstall(tab, response)))
      return;
    const handle = await tab.page.evaluateHandle<Element | null>(evaluateExpression('hostFor', String(params.id)));
    try {
      const element = handle.asElement();
      if (!element) {
        response.addError(`Fiber #${params.id} has no host element to click (component returned null or rendered no DOM).`);
        return;
      }
      response.setIncludeSnapshot();
      const options = { button: params.button, ...tab.actionTimeoutOptions };
      await tab.waitForCompletion(async () => {
        if (params.doubleClick)
          await element.dblclick(options);
        else
          await element.click(options);
      });
      response.addCode(`/* clicked host of React fiber #${params.id} */`);
    } catch (e) {
      response.addError(e instanceof Error ? e.message : String(e));
    } finally {
      await handle.dispose().catch(() => {});
    }
  },
});

const reactInspect = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_react_inspect',
    title: 'Inspect React component',
    description: 'Fetch props, state, hooks, context, and source location for a single fiber by id. IDs come from browser_react_tree and remain valid until the next navigation.',
    inputSchema: z.object({
      id: z.number().int().describe('Fiber id from browser_react_tree.'),
    }),
    type: 'readOnly',
  },

  handle: async (tab, params, response) => {
    if (!(await ensureHookOrInstall(tab, response)))
      return;
    try {
      const result = await tab.page.evaluate<InspectFiberResult>(evaluateExpression('inspect', String(params.id)));
      let body = result.text;
      if (result.source)
        body += `\nsource: ${result.source.name}:${result.source.line}:${result.source.column}`;
      response.addTextResult(body);
    } catch (e) {
      response.addError(e instanceof Error ? e.message : String(e));
    }
  },
});

function formatSuspenseReport(boundaries: SuspenseBoundary[], onlyDynamic: boolean): string {
  const filtered = onlyDynamic
    ? boundaries.filter(b => b.isSuspended || b.suspendedBy.length > 0 || b.unknownSuspenders)
    : boundaries;
  if (filtered.length === 0)
    return '# Suspense boundaries\nNo Suspense boundaries found.';
  const lines: string[] = [];
  lines.push(`# Suspense boundaries (${filtered.length}${onlyDynamic ? ' dynamic' : ' total'})`);
  for (const b of filtered) {
    const status = b.isSuspended ? 'suspended' : 'resolved';
    const envs = b.environments.length ? ` env=${b.environments.join(',')}` : '';
    lines.push('');
    lines.push(`## ${b.name ?? '(anonymous)'} #${b.id} - ${status}${envs}`);
    if (b.jsxSource)
      lines.push(`source: ${b.jsxSource.name}:${b.jsxSource.line}:${b.jsxSource.column}`);
    if (b.suspendedBy.length) {
      lines.push('suspended by:');
      for (const s of b.suspendedBy)
        lines.push(`  - ${s.name} ${s.duration ? `(${s.duration}ms)` : ''} ${s.description ? '- ' + s.description : ''}`);
    }
    if (b.unknownSuspenders)
      lines.push(`unknown suspenders: ${b.unknownSuspenders}`);
    if (b.owners.length)
      lines.push(`owners: ${b.owners.map(o => o.name).join(' > ')}`);
  }
  return lines.join('\n');
}

const reactSuspense = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_react_suspense',
    title: 'React Suspense boundaries',
    description: 'List Suspense boundaries with their suspended state, environments, and what they are suspended by.',
    inputSchema: z.object({
      onlyDynamic: z.boolean().optional().describe('Only return boundaries that are currently suspended or have suspendedBy data.'),
      filename: z.string().optional().describe('Save report to a markdown file instead of returning it inline.'),
    }),
    type: 'readOnly',
  },

  handle: async (tab, params, response) => {
    if (!(await ensureHookOrInstall(tab, response)))
      return;
    try {
      const boundaries = await tab.page.evaluate<SuspenseBoundary[]>(evaluateExpression('suspense'));
      const text = formatSuspenseReport(boundaries, !!params.onlyDynamic);
      await response.addResult('Suspense boundaries', text, { prefix: 'react-suspense', ext: 'md', suggestedFilename: params.filename });
    } catch (e) {
      response.addError(e instanceof Error ? e.message : String(e));
    }
  },
});

export default [
  reactDevtoolsInstall,
  reactTree,
  reactInspect,
  reactClick,
  reactSuspense,
];
