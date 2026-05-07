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

// Page-side helpers that drive the React DevTools renderer interface to
// extract the component tree, inspect a single fiber, and walk Suspense
// boundaries. The hook (`__REACT_DEVTOOLS_GLOBAL_HOOK__`) is a public contract
// maintained by React; it must be installed before page JS runs.
//
// Operation codes used to decode the renderer's `operations` payload come from
// `reactDevtoolsConstants.ts`, which is vendored from facebook/react.

import {
  ElementTypeRoot,
  SUSPENSE_TREE_OPERATION_ADD,
  SUSPENSE_TREE_OPERATION_REMOVE,
  SUSPENSE_TREE_OPERATION_REORDER_CHILDREN,
  SUSPENSE_TREE_OPERATION_RESIZE,
  SUSPENSE_TREE_OPERATION_SUSPENDERS,
  TREE_OPERATION_ADD,
  TREE_OPERATION_APPLIED_ACTIVITY_SLICE_CHANGE,
  TREE_OPERATION_REMOVE,
  TREE_OPERATION_REMOVE_ROOT_LEGACY,
  TREE_OPERATION_REORDER_CHILDREN,
  TREE_OPERATION_SET_SUBTREE_MODE,
  TREE_OPERATION_UPDATE_ERRORS_OR_WARNINGS,
  TREE_OPERATION_UPDATE_TREE_BASE_DURATION,
  UNKNOWN_SUSPENDERS_REASON_OLD_VERSION,
  UNKNOWN_SUSPENDERS_REASON_PRODUCTION,
  UNKNOWN_SUSPENDERS_REASON_THROWN_PROMISE,
} from './reactDevtoolsConstants';

type OperationsPayload = ArrayLike<number>;

type RendererInterface = {
  flushInitialOperations(): void;
  hasElementWithId(id: number): boolean;
  getDisplayNameForElementID(id: number): string | null;
  inspectElement(requestID: number, id: number, path: unknown, forceFullData: boolean): InspectResult | null | undefined;
};

type DevToolsHook = {
  rendererInterfaces?: { get(id: number): RendererInterface | undefined };
  emit: (event: string, payload: OperationsPayload) => void;
};

type InspectFullData = { type: 'full-data'; value: InspectValue };
type InspectResult = InspectFullData | { type: string };

type SourcePreview = { name?: string; line?: number; column?: number };

type Owner = { displayName?: string | null; env?: string | null; stack?: unknown };
type HookEntry = { id?: number | null; name?: string; value?: unknown; subHooks?: HookEntry[] };
type Suspender = {
  awaited?: { name?: string | null; description?: unknown; value?: unknown; start?: number; end?: number; env?: string | null; owner?: Owner | null; stack?: unknown };
  env?: string | null;
};

type InspectValue = {
  key?: unknown;
  props?: { data?: Record<string, unknown> } | Record<string, unknown> | null;
  hooks?: { data?: HookEntry[] } | HookEntry[] | null;
  state?: { data?: Record<string, unknown> } | Record<string, unknown> | null;
  context?: { data?: Record<string, unknown> } | Record<string, unknown> | null;
  owners?: Owner[] | null;
  source?: unknown;
  suspendedBy?: { data?: Suspender[] } | Suspender[] | null;
  unknownSuspenders?: number;
  stack?: unknown[];
};

export type TreeNode = {
  id: number;
  type: number;
  name: string | null;
  key: string | null;
  parent: number;
};

export type SuspenseBoundary = {
  id: number;
  parentID: number;
  name: string | null;
  isSuspended: boolean;
  environments: string[];
  suspendedBy: Array<{ name: string; description: string; duration: number; env: string | null }>;
  unknownSuspenders: string | null;
  owners: Array<{ name: string; env: string | null }>;
  jsxSource: SourcePreview | null;
};

export type InspectFiberResult = {
  text: string;
  source: SourcePreview | null;
};

const FLUSH_DELAY_MS = 50;
// Capture builtins at module scope so they survive any clock emulation that
// may run later in the page. eslint's no-restricted-globals rule wants
// `InjectedScript.utils.builtins.setTimeout`, but this module runs as a
// standalone bundle without InjectedScript context.
// eslint-disable-next-line no-restricted-globals
const _setTimeout = setTimeout;

function getHook(): DevToolsHook {
  // eslint-disable-next-line no-restricted-globals
  const hook = (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__ as DevToolsHook | undefined;
  if (!hook)
    throw new Error('React DevTools hook not installed');
  return hook;
}

function getRenderer(hook: DevToolsHook): RendererInterface {
  const ri = hook.rendererInterfaces?.get(1);
  if (!ri)
    throw new Error('No React renderer attached - the page has not booted React yet');
  return ri;
}

async function captureInitialOperations(hook: DevToolsHook, ri: RendererInterface): Promise<OperationsPayload[]> {
  return new Promise(resolve => {
    const out: OperationsPayload[] = [];
    const origEmit = hook.emit;
    hook.emit = function(event: string, payload: OperationsPayload) {
      if (event === 'operations')
        out.push(Array.from(payload));
      return origEmit.apply(hook, arguments as unknown as [string, OperationsPayload]);
    };
    ri.flushInitialOperations();
    _setTimeout(() => {
      hook.emit = origEmit;
      resolve(out);
    }, FLUSH_DELAY_MS);
  });
}

function decodeStringTable(ops: OperationsPayload, startIndex: number): { strings: Array<string | null>; nextIndex: number } {
  // Operations layout, copied from react-devtools-shared/src/devtools/store.js:
  //   [0]   rendererID
  //   [1]   rootID
  //   [2]   stringTableSize
  //   then string entries: <length><codepoints...>
  //   then operation entries
  const strings: Array<string | null> = [null];
  let i = startIndex + 1;
  const tableEnd = i + ops[startIndex];
  while (i < tableEnd) {
    const length = ops[i++];
    let s = '';
    for (let c = 0; c < length; c++)
      s += String.fromCodePoint(ops[i + c]);
    strings.push(s);
    i += length;
  }
  return { strings, nextIndex: i };
}

// Returns the offset to advance past `op` at `i`. The `i` passed in points at
// the op code itself.
function operationLength(op: number, ops: OperationsPayload, i: number): number {
  switch (op) {
    case TREE_OPERATION_ADD: {
      // We always handle ADD inline, but leave a fallback skip for safety.
      const type = ops[i + 2];
      return type === ElementTypeRoot ? 3 + 4 : 3 + 5;
    }
    case TREE_OPERATION_REMOVE:
      return 2 + ops[i + 1];
    case TREE_OPERATION_REORDER_CHILDREN:
      return 3 + ops[i + 2];
    case TREE_OPERATION_UPDATE_TREE_BASE_DURATION:
      return 3;
    case TREE_OPERATION_UPDATE_ERRORS_OR_WARNINGS:
      return 4;
    case TREE_OPERATION_REMOVE_ROOT_LEGACY:
      return 1;
    case TREE_OPERATION_SET_SUBTREE_MODE:
      return 3;
    case SUSPENSE_TREE_OPERATION_ADD: {
      // [op, id, parentID, nameStrID, isSuspended, numRects, rect*4 if numRects !== -1]
      const numRects = ops[i + 5];
      return 6 + (numRects === -1 ? 0 : numRects * 4);
    }
    case SUSPENSE_TREE_OPERATION_REMOVE:
      return 2 + ops[i + 1];
    case SUSPENSE_TREE_OPERATION_REORDER_CHILDREN:
      return 3 + ops[i + 2];
    case SUSPENSE_TREE_OPERATION_RESIZE: {
      const numRects = ops[i + 2];
      return 3 + (numRects === -1 ? 0 : numRects * 4);
    }
    case SUSPENSE_TREE_OPERATION_SUSPENDERS: {
      // [op, changeLen, then changeLen entries of: id, _, _, isSuspended, envLen, env*envLen]
      let j = i + 2;
      for (let c = 0; c < ops[i + 1]; c++)
        j += 5 + ops[j + 4];
      return j - i;
    }
    case TREE_OPERATION_APPLIED_ACTIVITY_SLICE_CHANGE:
      return 2;
    default:
      return 1;
  }
}

function decodeTree(ops: OperationsPayload): TreeNode[] {
  const { strings, nextIndex } = decodeStringTable(ops, 2);
  const out: TreeNode[] = [];
  let i = nextIndex;
  while (i < ops.length) {
    const op = ops[i];
    if (op === TREE_OPERATION_ADD) {
      const id = ops[i + 1];
      const type = ops[i + 2];
      i += 3;
      if (type === ElementTypeRoot) {
        out.push({ id, type, name: null, key: null, parent: 0 });
        i += 4;
      } else {
        const parent = ops[i];
        const name = strings[ops[i + 2]] ?? null;
        const key = strings[ops[i + 3]] ?? null;
        out.push({ id, type, name, key, parent });
        i += 5;
      }
    } else {
      i += operationLength(op, ops, i);
    }
  }
  return out;
}

function decodeSuspenseBoundaries(ops: OperationsPayload, map: Map<number, SuspenseBoundary>): void {
  const { strings, nextIndex } = decodeStringTable(ops, 2);
  let i = nextIndex;
  while (i < ops.length) {
    const op = ops[i];
    if (op === SUSPENSE_TREE_OPERATION_ADD) {
      const id = ops[i + 1];
      const parentID = ops[i + 2];
      const nameStrID = ops[i + 3];
      const isSuspended = ops[i + 4] === 1;
      map.set(id, {
        id, parentID,
        name: strings[nameStrID] ?? null,
        isSuspended,
        environments: [],
        suspendedBy: [],
        unknownSuspenders: null,
        owners: [],
        jsxSource: null,
      });
      i += operationLength(op, ops, i);
    } else if (op === SUSPENSE_TREE_OPERATION_SUSPENDERS) {
      let j = i + 1;
      const changeLen = ops[j++];
      for (let c = 0; c < changeLen; c++) {
        const id = ops[j++];
        j += 2;
        const isSuspended = ops[j++] === 1;
        const envLen = ops[j++];
        const envs: string[] = [];
        for (let e = 0; e < envLen; e++) {
          const n = strings[ops[j++]];
          if (n !== null)
            envs.push(n);
        }
        const node = map.get(id);
        if (node) {
          node.isSuspended = isSuspended;
          for (const env of envs) {
            if (!node.environments.includes(env))
              node.environments.push(env);
          }
        }
      }
      // j is now the post-SUSPENDERS cursor.
      i = j;
    } else {
      i += operationLength(op, ops, i);
    }
  }
}

function previewValue(v: unknown): string {
  if (v === null || v === undefined)
    return String(v);
  if (typeof v !== 'object')
    return JSON.stringify(v);
  const obj = v as Record<string, unknown>;
  if (obj.type === 'undefined')
    return 'undefined';
  if (typeof obj.preview_long === 'string')
    return obj.preview_long;
  if (typeof obj.preview_short === 'string')
    return obj.preview_short;
  if (Array.isArray(v))
    return '[' + v.map(previewValue).join(', ') + ']';
  return '{' + Object.entries(obj).map(([k, val]) => k + ': ' + previewValue(val)).join(', ') + '}';
}

function previewDescription(v: unknown): string {
  if (v === null || v === undefined)
    return '';
  if (typeof v === 'string')
    return v;
  if (typeof v !== 'object')
    return String(v);
  const obj = v as Record<string, unknown>;
  if (typeof obj.preview_long === 'string')
    return obj.preview_long;
  if (typeof obj.preview_short === 'string')
    return obj.preview_short;
  if (typeof obj.value === 'string')
    return obj.value;
  try {
    const s = JSON.stringify(v);
    return s.length > 80 ? s.slice(0, 77) + '...' : s;
  } catch {
    return '';
  }
}

function unwrapData<T>(payload: { data?: T } | T | null | undefined): T | null {
  if (payload === null || payload === undefined)
    return null;
  if (typeof payload === 'object' && 'data' in (payload as object))
    return (payload as { data: T }).data;
  return payload as T;
}

function sourceToPreview(s: unknown): SourcePreview | null {
  if (!Array.isArray(s) || s.length < 4)
    return null;
  return { name: typeof s[1] === 'string' ? s[1] : '(unknown)', line: typeof s[2] === 'number' ? s[2] : 0, column: typeof s[3] === 'number' ? s[3] : 0 };
}

export class ReactDevtools {
  async tree(): Promise<TreeNode[]> {
    const hook = getHook();
    const ri = getRenderer(hook);
    const batches = await captureInitialOperations(hook, ri);
    return batches.flatMap(decodeTree);
  }

  async inspect(id: number): Promise<InspectFiberResult> {
    const hook = getHook();
    const ri = getRenderer(hook);
    if (!ri.hasElementWithId(id))
      throw new Error(`element ${id} not found (page reloaded?)`);
    const result = ri.inspectElement(1, id, null, true);
    if (!result || result.type !== 'full-data')
      throw new Error('inspect failed: ' + (result && result.type));
    const v = (result as InspectFullData).value;
    const name = ri.getDisplayNameForElementID(id);
    const lines: string[] = [`${name ?? '(anonymous)'} #${id}`];
    if (v.key !== null && v.key !== undefined)
      lines.push('key: ' + JSON.stringify(v.key));
    this._addObjectSection(lines, 'props', unwrapData(v.props ?? null) as Record<string, unknown> | null);
    this._addHooksSection(lines, 'hooks', unwrapData(v.hooks ?? null) as HookEntry[] | null);
    this._addObjectSection(lines, 'state', unwrapData(v.state ?? null) as Record<string, unknown> | null);
    this._addObjectSection(lines, 'context', unwrapData(v.context ?? null) as Record<string, unknown> | null);
    if (v.owners?.length)
      lines.push('rendered by: ' + v.owners.map(o => o.displayName).filter(Boolean).join(' > '));
    return { text: lines.join('\n'), source: sourceToPreview(v.source) };
  }

  async suspense(): Promise<SuspenseBoundary[]> {
    const hook = getHook();
    const ri = getRenderer(hook);
    const batches = await captureInitialOperations(hook, ri);
    const map = new Map<number, SuspenseBoundary>();
    for (const ops of batches)
      decodeSuspenseBoundaries(ops, map);
    const results: SuspenseBoundary[] = [];
    for (const b of map.values()) {
      if (b.parentID === 0)
        continue;
      if (ri.hasElementWithId(b.id)) {
        const displayName = ri.getDisplayNameForElementID(b.id);
        if (displayName)
          b.name = displayName;
        const result = ri.inspectElement(1, b.id, null, true);
        if (result && result.type === 'full-data')
          this._mergeInspectionIntoBoundary(b, (result as InspectFullData).value);
      }
      results.push(b);
    }
    return results;
  }

  private _addObjectSection(lines: string[], label: string, data: Record<string, unknown> | null) {
    if (!data)
      return;
    const entries = Object.entries(data);
    if (!entries.length)
      return;
    lines.push(label + ':');
    for (const [k, val] of entries)
      lines.push('  ' + k + ': ' + previewValue(val));
  }

  private _addHooksSection(lines: string[], label: string, data: HookEntry[] | null) {
    if (!data || !data.length)
      return;
    lines.push(label + ':');
    for (const h of data) {
      const idx = h.id !== null && h.id !== undefined ? `[${h.id}] ` : '';
      const sub = h.subHooks?.length ? ` (${h.subHooks.length} sub)` : '';
      lines.push(`  ${idx}${h.name ?? '?'}: ${previewValue(h.value)}${sub}`);
    }
  }

  private _mergeInspectionIntoBoundary(boundary: SuspenseBoundary, data: InspectValue) {
    const suspenders = unwrapData(data.suspendedBy ?? null);
    if (Array.isArray(suspenders)) {
      for (const entry of suspenders) {
        const awaited = entry?.awaited;
        if (!awaited)
          continue;
        const desc = previewDescription(awaited.description) || previewDescription(awaited.value);
        boundary.suspendedBy.push({
          name: awaited.name ?? 'unknown',
          description: desc,
          duration: typeof awaited.end === 'number' && typeof awaited.start === 'number' ? Math.round(awaited.end - awaited.start) : 0,
          env: awaited.env ?? entry.env ?? null,
        });
      }
    }
    if (data.unknownSuspenders) {
      const reasons: Record<number, string> = {
        [UNKNOWN_SUSPENDERS_REASON_PRODUCTION]: 'production build (no debug info)',
        [UNKNOWN_SUSPENDERS_REASON_OLD_VERSION]: 'old React version (missing tracking)',
        [UNKNOWN_SUSPENDERS_REASON_THROWN_PROMISE]: 'thrown Promise (library using throw instead of use())',
      };
      boundary.unknownSuspenders = reasons[data.unknownSuspenders] ?? 'unknown reason';
    }
    if (Array.isArray(data.owners)) {
      for (const o of data.owners) {
        if (o?.displayName)
          boundary.owners.push({ name: o.displayName, env: o.env ?? null });
      }
    }
    if (Array.isArray(data.stack) && data.stack.length > 0)
      boundary.jsxSource = sourceToPreview(data.stack[0]);
  }
}
