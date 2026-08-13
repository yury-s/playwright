# Prototype: Chromium headless tests with rendering completely disabled (BeginFrameControl)

**Idea under test**: run the Chromium headless shell with `--enable-begin-frame-control` so that
frames are only produced when explicitly requested via `HeadlessExperimental.beginFrame` — i.e.
rendering (commit/raster/draw + GPU work) never happens — and measure what that buys for
Playwright test workloads. Known accepted limitation: screenshots don't work.

**Outcome**: after making Playwright's actionability machinery frame-independent, the full
no-frames mode runs real interaction flows at baseline wall time with **−97% browser CPU on
rendering-heavy pages** and a 98% pass rate on an interaction-heavy slice of the Playwright
test suite. The remaining gaps are a Chromium-side input-ack dependency (wheel/mouse-move,
to be fixed separately), screenshots, and inherent frame-lifecycle semantics of page content.

## Prototype pieces (uncommitted, on main)

- `packages/playwright-core/src/server/chromium/chromiumSwitches.ts` —
  `PW_EXPERIMENTAL_BEGIN_FRAME_CONTROL=1` adds `--enable-begin-frame-control` **and**
  `--run-all-compositor-stages-before-draw` (required by the `HeadlessExperimental.beginFrame`
  handler). Guarded off on macOS (see Finding 0).
- `packages/playwright-core/src/server/chromium/crPage.ts` — optional "frame pump"
  (`PW_EXPERIMENTAL_BEGIN_FRAME_PUMP=<ms>`, `..._PUMP_DISPLAY=1` for full frames). Kept for
  comparison; the pump turned out to be the wrong design (see Finding 4).
- `packages/injected/src/injectedScript.ts` + `server/dom.ts` — **`noFrames` injected-script
  mode** (auto-enabled with the env var on Chromium): the `stable` actionability check samples
  bounding boxes on a `setTimeout` cadence instead of rAF (first sample taken synchronously),
  and `viewportRatio` (used only by `expect(locator).toBeInViewport()`) is computed
  geometrically because IntersectionObserver notifications are only delivered as part of the
  frame lifecycle. The geometric ratio ignores clipping by scrollable ancestors — acceptable
  since it is confined to that one assertion; actionability (visible/enabled/stable/hit-target)
  never uses IntersectionObserver.
- `tests/config/utils.ts` — the suite's `rafraf()` helper falls back to a timer under the env
  var (it otherwise awaits two rAFs and hangs; this was the largest source of suite failures).
- `no-render-bench/` — `probe.js` (capability matrix), `bench.js` (synthetic scenarios +
  `--group=real` live-site flows; wall + per-process CPU via `SystemInfo.getProcessInfo`),
  `suite.js` (tests/page slice runner), raw JSON in `results/`.

### Modes

| mode | frames |
|---|---|
| `baseline` | internal, damage-driven (~60fps cap) |
| `bfc-only` | **none, ever** (+ `noFrames` injected mode) |
| `bfc-pump` | animate-only frame every ~16ms per page (`noDisplayUpdates: true`) |
| `bfc-pump-disp` | full frame every ~16ms per page |

## Finding 0: platform support

**BeginFrameControl does not exist on macOS.** The mac headless shell has a long-standing TODO
(`headless/lib/browser/headless_platform_delegate_mac.mm`); only the aura path (Linux/Windows)
wires the external begin-frame source. On mac the switch alone is silently ignored, and
combined with `--run-all-compositor-stages-before-draw` the shell **crashes with SIGTRAP**
under Playwright's launch flow. The prototype guards the switches with
`process.platform !== 'darwin'`. All measurements below are from a Linux arm64 container
(Docker, 18 vCPUs, Chrome Headless Shell 152.0.7977.8, chromium-headless-shell v1237).

Also: `--enable-begin-frame-control` is rejected together with `--site-per-process`
(`headless/lib/browser/command_line_handler.cc`).

## Finding 1: capability matrix (Linux)

With the `noFrames` injected mode in place:

| capability | baseline | bfc-only | bfc-pump | bfc-pump-disp |
|---|---|---|---|---|
| `goto` / `evaluate` / DOM timers / network | ok | ok | ok | ok |
| `requestAnimationFrame` in page | ~60fps | **never fires** | ticks (starves under composited-animation load) | ticks |
| CSS animations / transitions | run | **frozen** | advance | advance |
| page-content IntersectionObserver | ok | **never fires** (breaks lazy-loading etc.) | ok | ok |
| `locator.click()` and friends | ok | **ok** — timer-sampled `stable` check (~57ms/click vs ~34ms; fixed 16ms sampling gap is the floor) | ok | ok |
| `fill` / `keyboard.type` / queries / `waitFor*` | ok | ok (retries are server-timed) | ok | ok |
| `hover` / `mouse.move` (tween, drag) | ok | **hangs** | **hangs** | ok |
| `page.mouse.wheel` | ok | **hangs** | **hangs** | ok |
| scrolling (wheel, PageDown) | ok | **silent no-op / hang** | same | ok |
| `page.screenshot` | ok | hangs → timeout | fails fast | works |

The wheel/mouse-move/scroll rows are one Chromium-side issue: input acks and scroll-offset
application are tied to frame submission. **Treated as a Chromium bug to be addressed
separately** — not designed around in Playwright (in particular, not by turning display
updates on).

## Finding 2: synthetic scenarios

Wall ms (total browser CPU s), stable across 2+ iterations:

| scenario | baseline | bfc-only | bfc-pump | bfc-pump-disp |
|---|---|---|---|---|
| nav ×30 / article ×20 / fill ×50 / type / query ×400 | — | all within noise of baseline | — | — |
| click ×100 (full actionability) | 3366 (0.95) | 5718 (1.17) | 3934 (1.03) | 4054 (1.18) |
| click-force ×100 | 257 (0.29) | 247 (0.25) | 223 (0.24) | 253 (0.30) |
| **anim-css 4s hold** (250 composited + 80 layout animations) | 4023 (**2.22**: rend 1.25 + GPU 0.95) | 4023 (**0.03**) | 4021 (0.25) | 4021 (1.26) |
| **anim-canvas 4s hold** | 4034 (**1.52**) | 4026 (**0.04**) | 4020 (1.16) | 4021 (1.11) |
| dom-churn ×120 (forced sync layout) | 1185 (1.45) | 1056 (1.24) | 1239 (1.51) | 1154 (1.40) |

- Headless-shell rendering is damage-driven, so mostly-static interaction pages have ~nothing
  to save (GPU ≈ 0.01s per scenario in baseline).
- Continuous animation is where rendering cost lives: `bfc-only` eliminates ~98% of it.
- Canvas rAF workloads only save the compositing/GPU share in pump mode — the JS draw calls
  themselves still run whenever rAF runs.

## Finding 3: Playwright test-suite slice (tests/page, 14 spec files, 4 workers)

| mode | result | wall |
|---|---|---|
| baseline | 467 passed, 6 skipped | 22.0s |
| bfc-pump | 467 passed | 22.0s |
| bfc-only (noFrames actionability + `rafraf` helper fix) | **458 passed, 9 failed** | 92.3s* |

\* passing tests run at baseline speed; the wall difference is the 9 failures burning their
30s timeouts.

The 9 remaining failures contain **zero product-level frame dependencies**:

- 5 × mouse-move family (hover, tweened moves, drag, post-context-menu move) — the Chromium
  input-ack bug above. The failure log shows actionability completing ("element is visible and
  stable") and the move dispatch hanging.
- 3 × page-content frame-lifecycle semantics, inherent to no-render mode: clicks land at a
  frozen CSS-transition position; an element animating into the viewport never arrives; a
  lazy-loader driven by the page's own IntersectionObserver never fires.
- 1 × timing-sensitive race test (`should not hang when frame is detached`) that *expects* a
  click to fail mid-detach; without frame waits the click wins the race. Nothing hangs.

Also of note: `wheel.spec.ts` fails 6/7 in any no-frames mode (same Chromium bug).

## Finding 4: real-world sites

Live-site flows (playwright.dev SPA section switching via real clicks; github.com animated
homepage + repo tab switching; google.com search — google served its `/sorry` interstitial in
all modes equally, so it measures a light page). CPU is the meaningful metric; wall includes
network noise.

With frame-independent actionability (real clicks, no fallbacks):

| scenario | baseline | bfc-only |
|---|---|---|
| playwright.dev, 5 sections | 10326ms (1.08s) | 10370ms (**0.62s**, −43%) |
| github.com home + repo tabs | 15153ms (**67.9s**) | 14568ms (**2.2s**, −97%) |
| google.com | 5555ms (1.29s) | 5608ms (1.21s) |

github's anonymous homepage renders a WebGL hero through SwiftShader: **~54 of its baseline
CPU seconds sit in the GPU process (~4 cores) while the page idles.** `bfc-only` removes
essentially all of it at identical wall time.

Earlier iterations also established why the pump designs lose:

- `bfc-pump` (animate-only 16ms): **+30% CPU over baseline on github** — rAF keeps the WebGL
  draw calls executing, and the fixed cadence outpaces the self-throttled baseline. It also
  taxes idle pages with a 60Hz lifecycle. The pump defeats the purpose exactly where rendering
  is expensive.
- `bfc-pump-disp`: everything works (even screenshots) at roughly −47% CPU on github — an
  accidental "reduced fps" mode, but far from the no-frames win.

## Verdict

Disabling rendering via BeginFrameControl is viable and pays off big — **if** nothing relies
on the frame lifecycle:

1. **Playwright-side frame dependencies are small and removable.** Only two existed: the
   `stable` actionability sampler (rAF) and `toBeInViewport`'s IntersectionObserver. With both
   made frame-independent (`noFrames` injected mode), real flows run unmodified at baseline
   wall time: 98% suite pass rate, −97% CPU on rendering-heavy sites, ~0 GPU work.
2. **A continuous frame pump is the wrong design** — neutral-to-harmful everywhere, actively
   counterproductive on WebGL/canvas pages.
3. **Remaining Chromium-side work**: input acks / scroll-offset application require submitted
   frames (wheel hangs, mouse-move hangs, keyboard scrolling silently no-ops). To be fixed in
   Chromium separately — not worked around by enabling display updates.
4. **Inherent semantics** (accepted cost of the mode): screenshots/video, frozen
   CSS animations, page rAF/IntersectionObserver-driven behavior (lazy-loading), and
   tests asserting on any of those.
5. **Platform**: Linux/Windows only; macOS lacks BeginFrameControl entirely (and crashes on
   the switch combination — guarded off).

Where the win lands in practice: tests against animation/WebGL/canvas-heavy pages get their
browser CPU back (→ higher worker density on CI); mostly-static pages were already ~free.
Per-click latency currently costs ~23ms extra from the fixed 16ms stability-sampling gap
(baseline gets consecutive on-demand frames faster); suite-level impact was not measurable.

## Repro

```bash
docker run -d --name pw-bfc-bench --init --shm-size=2g \
  -v "$PWD":/repo -v pwbench-browsers:/pw-browsers \
  -e PLAYWRIGHT_BROWSERS_PATH=/pw-browsers -w /repo node:22-bookworm sleep infinity
docker exec pw-bfc-bench node packages/playwright-core/cli.js install --with-deps chromium

docker exec pw-bfc-bench node /repo/no-render-bench/probe.js                    # capability matrix
docker exec pw-bfc-bench node /repo/no-render-bench/bench.js all                # synthetic
docker exec pw-bfc-bench node /repo/no-render-bench/bench.js all --group=real   # live sites
docker exec -w /repo pw-bfc-bench node no-render-bench/suite.js baseline bfc-only
```
