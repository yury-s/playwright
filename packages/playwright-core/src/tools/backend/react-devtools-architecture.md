# React DevTools and Web Vitals tools — architecture

This doc explains how the `browser_react_*` and `browser_web_vitals` MCP tools (and the matching CLI commands) are wired together. Read it if you're adding another React tool, syncing the vendored hook against upstream, or trying to understand why a request from the CLI ends up returning a fiber tree.

## What the feature is

Five MCP tools, each with a matching CLI command:

| MCP tool                          | CLI command                  | Purpose                                                                    |
| --------------------------------- | ---------------------------- | -------------------------------------------------------------------------- |
| `browser_react_devtools_install`  | `react-devtools-install`     | Register the React DevTools hook on the context via `addInitScript`.       |
| `browser_react_tree`              | `react-tree`                 | Walk the renderer interface and dump fiber id / parent / name / key.       |
| `browser_react_inspect`           | `react-inspect <id>`         | Pull props / state / hooks / source for one fiber.                         |
| `browser_react_suspense`          | `react-suspense`             | List Suspense boundaries with suspended state and reasons.                 |
| `browser_web_vitals`              | `vitals`                     | Capture LCP / CLS / FCP / INP / TTFB via Google's `web-vitals` library.    |

The first four require the React DevTools hook installed before page JS runs. The fifth is independent.

## End-to-end flow

```
agent / human                     daemon                       page
─────────────                     ──────                       ────
$ playwright-cli react-tree
   │
   │  parsed by cli-daemon/commands.ts
   │  → toolName: 'browser_react_tree'
   ▼
Tool handler in
backend/react.ts
   │
   │  page.evaluate("(() => { const module = {};
   │                  ${REACT_DEVTOOLS_SOURCE};
   │                  return new (module.exports.ReactDevtools())().tree();
   │                })()")
   ▼                                                            ▼
                                                          ReactDevtools class
                                                          (bundled from
                                                           injected/reactDevtools.ts)
                                                            │
                                                            │  hook.rendererInterfaces.get(1)
                                                            │  .flushInitialOperations()
                                                            ▼
                                                          React DevTools backend
                                                          (installed before page JS,
                                                           registered by React on boot)
                                                            │
                                                            │  emits "operations"
                                                            ▼
                                                          decode → TreeNode[]
   ◄─────────────────────────────────────────────────────────
return value
   │
   │  formatTree(nodes) → markdown
   ▼
stdout
```

## Layered architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│ CLI layer — packages/playwright-core/src/tools/cli-daemon/commands.ts  │
│   declareCommand({                                                     │
│     name: 'react-tree',                                                │
│     toolName: 'browser_react_tree',                                    │
│     toolParams: ({ filename }) => ({ filename }),                      │
│   })                                                                   │
└──────────────────────────────┬─────────────────────────────────────────┘
                               │ name + params → daemon dispatcher
                               ▼
┌────────────────────────────────────────────────────────────────────────┐
│ MCP tool layer — packages/playwright-core/src/tools/backend/react.ts   │
│   defineTabTool({                                                      │
│     schema: { name: 'browser_react_tree', ... },                       │
│     handle: async (tab, params, response) => {                         │
│       if (!(await ensureHookOrInstall(tab, response))) return;         │
│       const nodes = await tab.page.evaluate(                           │
│         evaluateExpression('tree'));                                   │
│       response.addResult('React tree', formatTree(nodes), ...);        │
│     },                                                                 │
│   })                                                                   │
└──────────────────────────────┬─────────────────────────────────────────┘
                               │ page.evaluate(<bundled source IIFE>)
                               ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Page layer — packages/injected/src/reactDevtools.ts                    │
│                                                                        │
│   class ReactDevtools {                                                │
│     async tree(): Promise<TreeNode[]> {                                │
│       const hook = getHook();                                          │
│       const ri = getRenderer(hook);                                    │
│       const batches = await captureInitialOperations(hook, ri);        │
│       return batches.flatMap(decodeTree);                              │
│     }                                                                  │
│     ...                                                                │
│   }                                                                    │
│                                                                        │
│   bundled by utils/generate_injected.js into                           │
│   packages/playwright-core/src/generated/reactDevtoolsSource.ts        │
└────────────────────────────────────────────────────────────────────────┘
                               │ runs against
                               ▼
┌────────────────────────────────────────────────────────────────────────┐
│ React DevTools backend — installed by installHook.js, registered by    │
│ React on boot. Provides:                                               │
│   __REACT_DEVTOOLS_GLOBAL_HOOK__                                       │
│     .rendererInterfaces.get(1)                                         │
│       .flushInitialOperations()                                        │
│       .inspectElement(rendererID, id, path, forceFullData)             │
│       .hasElementWithId(id)                                            │
│       .getDisplayNameForElementID(id)                                  │
└────────────────────────────────────────────────────────────────────────┘
```

## The hook (`installHook.js`)

`packages/playwright-core/src/tools/backend/installHook.js` is the **pre-bundled** React DevTools content script vendored from facebook/react. It sets up `window.__REACT_DEVTOOLS_GLOBAL_HOOK__` so React detects it during boot and registers its renderer.

**Why pre-bundled and not built from source.** The upstream entry point [`packages/react-devtools-extensions/src/contentScripts/installHook.js`](https://github.com/facebook/react/blob/main/packages/react-devtools-extensions/src/contentScripts/installHook.js) imports [`installHook` from `react-devtools-shared/src/hook.js`](https://github.com/facebook/react/blob/main/packages/react-devtools-shared/src/hook.js). Neither package is published — `react-devtools-shared` on npm is a 448-byte placeholder. `react-devtools-core` *is* published but ships the entire DevTools backend (15.9 MB, plus `ws` and `shell-quote` deps), and the install hook is buried inside its bundle, not a clean export. Vendoring is the only practical option.

The file header pins the upstream commit and source-file blob SHAs. To resync, fetch a fresh bundle from the React DevTools extension's build output and bump those pins.

**Why no sourcemap.** We register the hook via `addInitScript({ content })`, which inlines the script string with no URL the browser can fetch a `.map` from. An inline `data:` sourcemap would multiply the embedded payload 5× for a debug-only feature. Stack frames inside the hook are slightly opaque, which we accept.

**Hook install model — lazy.** Each `browser_react_*` tool calls `ensureHookOrInstall()`. If the hook is already on `window`, the tool runs. If not, the tool calls `context.addInitScript({ content: INSTALL_HOOK_JS })` and returns an error telling the agent to reload. After the next navigation the hook is in place. No separate "install + reload" dance is required for the agent to remember.

## The renderer interface

The hook exposes `rendererInterfaces.get(1)`, a backend-side wrapper React DevTools attaches per renderer. It's a stable public-ish contract — Meta versions it carefully because the Chrome extension, Firefox extension, RN DevTools, and the standalone DevTools app all rely on it.

We use four methods:

- `flushInitialOperations()` — replays the renderer's initial state as `operations` events on the hook.
- `inspectElement(rendererID, id, path, forceFullData)` — returns props, hooks, state, context, owners, source location for one fiber.
- `hasElementWithId(id)` — guard before `inspectElement`.
- `getDisplayNameForElementID(id)` — for Suspense boundaries that don't carry a name in the operations payload.

We never reach into private DevTools modules. If React adds a new method to this surface or removes one, our scripts notice immediately.

## The operations payload

`flushInitialOperations()` doesn't return a value — it emits `operations` events on `hook.emit`, where the payload is a packed `Int32Array`. We monkey-patch `hook.emit` for ~50 ms to capture batches, then decode them.

The wire format:

```
[0]    rendererID
[1]    rootID
[2]    stringTableSize
[3..]  string table entries: <length> <codepoint>*length
       then operation entries:
         <op> <op-specific operands>
```

Op codes are vendored verbatim from facebook/react in [`packages/injected/src/reactDevtoolsConstants.ts`](../../../../injected/src/reactDevtoolsConstants.ts). The header pins:

- `react-devtools-shared/src/constants.js` — `TREE_OPERATION_*`, `SUSPENSE_TREE_OPERATION_*`, unknown-suspender reasons.
- `react-devtools-shared/src/frontend/types.js` — `ElementType*` codes (we use `ElementTypeRoot` to detect root fibers).

When upstream adds a new op code, two things happen:

1. Our `operationLength()` switch returns `1` for unknown ops, advancing past them as no-ops. The decoder doesn't crash.
2. Bumping `reactDevtoolsConstants.ts` to the new commit gets the named constant, and the `case` in `operationLength()` can be filled out.

In other words: backward compatibility for old payloads is automatic; forward compatibility for new payload semantics is a one-file sync.

**Why we don't bundle facebook/react's decoder.** The full upstream decoder lives in [`react-devtools-shared/src/devtools/store.js`](https://github.com/facebook/react/blob/main/packages/react-devtools-shared/src/devtools/store.js) (~80 KB) tightly coupled to a `Store` class that maintains the entire DevTools UI state. Embedding it would mean shipping the DevTools UI's runtime to every page. Our ~30-line decoder produces flat `TreeNode[]` and `SuspenseBoundary[]` outputs that match what the tools need.

## Bundling pipeline

`packages/injected/src/reactDevtools.ts` is plain TypeScript: it imports constants, defines types for the renderer interface, and exports a `ReactDevtools` class. The same pattern as `storageScript.ts`, `injectedScript.ts`, etc.

The build runs:

```
utils/generate_injected.js
  └── for each entry in injectedScripts[]:
        esbuild build → packages/injected/lib/<name>.js
        wrap → export const source = "<bundled JS as string>"
        write → packages/playwright-core/src/generated/<name>Source.ts
```

`packages/playwright-core/src/tools/backend/react.ts` imports the generated `source` string and runs it through a small CJS-shaped IIFE wrapper:

```ts
return `(() => {
  const module = { exports: {} };
  ${REACT_DEVTOOLS_SOURCE};
  const script = new (module.exports.ReactDevtools())();
  return script.${method}(${args});
})()`;
```

The wrapper, the bundled source, and the method invocation become a single string passed to `tab.page.evaluate(...)`. This is the same pattern used elsewhere in playwright-core for evaluating bundled injected modules in the page.

Two build-pipeline subtleties worth knowing:

1. The generated source is *gitignored*. Don't commit it. The build regenerates `packages/playwright-core/src/generated/{reactDevtools,webVitals}Source.ts` from the TypeScript sources.
2. esbuild emits per-file section comments like `// node_modules/web-vitals/dist/web-vitals.js`. Those literal `node_modules/` substrings used to trip the coreBundle path-leak guard. `generate_injected.js` strips them post-bundle (look for the `^// node_modules/` regex).

## Web Vitals

`browser_web_vitals` is structurally similar but doesn't use the React DevTools hook:

- `packages/injected/src/webVitals.ts` wraps `onLCP`, `onCLS`, `onFCP`, `onINP`, `onTTFB` from Google's [`web-vitals`](https://www.npmjs.com/package/web-vitals) npm package (root devDependency, version 5.x). The wrapper installs the observers and stashes results on a private global (`__pw_web_vitals_state__`).
- Calibration logic — INP replaced FID, CLS scoring evolved, LCP gating got subtler — is Google's responsibility. We don't reimplement it.
- Lazy install matches the React tools: first call to `vitals` registers the init script *and* runs it on the current page (best-effort, misses already-fired entries). Reload to capture full metrics.

`packages/injected/src/DEPS.list` allows `node_modules/web-vitals`. The dep is only used at build time — the bundled output is embedded in `playwright-core`'s lib; the npm package isn't a runtime dep of playwright-core.

## What we deliberately don't do

- **No renders profiler.** Agent-browser ships one (`hook.onCommitFiberRoot` walker), but it's not part of upstream React DevTools — the upstream Profiler tab uses [`profilingHooks.js`](https://github.com/facebook/react/blob/main/packages/react-devtools-shared/src/backend) and produces differently shaped data. We dropped the agent-browser version to avoid carrying parallel maintenance for a script that isn't in any upstream contract.
- **No `react=` selector engine.** The previous `_react=` and `_vue=` engines were removed in [PR #38263](https://github.com/microsoft/playwright/pull/38263) (Nov 2025) for sound reasons. The audience here is *agent introspection* (LLMs investigating live pages), not *test selectors* (committed code coupled to React internals). The introspection tools live in MCP/CLI; reintroducing `page.locator('react=...')` is a separate decision we deferred.
- **No auto-reload after install.** A reload would clear form state and surprise the user. The lazy-install path returns a clear error message instead; the agent reloads explicitly with `browser_navigate_reload` when ready.
- **No public TypeScript API.** This feature ships through MCP and the CLI daemon, not through `page.<method>()`. No `protocol.yml` change, no docs/src change, no `types.d.ts` change.

## How to extend

**Adding a new React tool:**

1. Add a method to `ReactDevtools` in `packages/injected/src/reactDevtools.ts`. Keep it self-contained; the bundle has no access to playwright-core.
2. Export the return type so the server side can import it.
3. In `packages/playwright-core/src/tools/backend/react.ts`, add a `defineTabTool({ ... })` calling `evaluateExpression('yourMethod')`. Register in the `export default [...]` array.
4. Add a `declareCommand({ ... })` in `packages/playwright-core/src/tools/cli-daemon/commands.ts` and append to `commandsArray`.
5. Add MCP and CLI tests against the reading-list fixture.

**Syncing `installHook.js`:**

1. Fetch the latest bundled hook from the React DevTools extension's build output.
2. Replace `packages/playwright-core/src/tools/backend/installHook.js`.
3. Update the `Pinned upstream sources` block in the file header — bump the commit and the two blob SHAs.

**Syncing op codes:**

1. Diff our `reactDevtoolsConstants.ts` against `react-devtools-shared/src/constants.js` and `react-devtools-shared/src/frontend/types.js` at HEAD.
2. Update names and pinned URLs.
3. If new ops appear, add a `case` to `operationLength()` in `packages/injected/src/reactDevtools.ts` so the decoder advances correctly. The default `return 1` keeps unknown ops from crashing in the meantime.

## Tests

Two test files cover the surfaces:

- `tests/mcp/react.spec.ts` — direct MCP `client.callTool({ name: 'browser_react_*' })` calls.
- `tests/mcp/cli-react.spec.ts` — CLI subprocess via the `cli` fixture (`tests/mcp/cli-fixtures.ts`).

Both files use the existing [`tests/assets/reading-list/react{16,17,18}.html`](../../../../../tests/assets/reading-list/) fixtures. These are the same fixtures the removed `_react=` selector tests used; they exercise function components, class components, `React.memo`, fragments, keyed children, and prop combinations. Coverage:

- Tree contents per React version (16, 17, 18).
- Prop / state inspection (`color: "red"`, `enabled: true`, `nested.index: 0`, `App.state.books`).
- Owner chains (`rendered by: ... App`).
- Post-interaction tree refresh (typing in the input + clicking "new book" → 3 → 4 BookItems).
- Error paths (no hook, no renderer, missing fiber id).
- File output options (`--filename`).
