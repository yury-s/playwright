/**
 * Validation probe for running the Chromium headless shell with
 * --enable-begin-frame-control (frames only produced on demand).
 *
 * Modes:
 *   R0  baseline        — regular headless shell
 *   R2  bfc-only        — --enable-begin-frame-control, no frames ever issued
 *   R1  bfc-pump        — flag + CRPage pumps HeadlessExperimental.beginFrame({noDisplayUpdates: true})
 *   R1d bfc-pump-disp   — flag + pump with noDisplayUpdates: false (full commit/draw per pumped frame)
 *
 * Usage: node probe.js [modes...]
 */
'use strict';
const path = require('path');
const { execSync } = require('child_process');

const playwright = require(path.join(__dirname, '..', 'packages', 'playwright-core'));

const MODES = {
  'baseline': {},
  'bfc-only': { PW_EXPERIMENTAL_BEGIN_FRAME_CONTROL: '1' },
  'bfc-pump': { PW_EXPERIMENTAL_BEGIN_FRAME_CONTROL: '1', PW_EXPERIMENTAL_BEGIN_FRAME_PUMP: '16' },
  'bfc-pump-disp': { PW_EXPERIMENTAL_BEGIN_FRAME_CONTROL: '1', PW_EXPERIMENTAL_BEGIN_FRAME_PUMP: '16', PW_EXPERIMENTAL_BEGIN_FRAME_PUMP_DISPLAY: '1' },
};

const ENV_KEYS = ['PW_EXPERIMENTAL_BEGIN_FRAME_CONTROL', 'PW_EXPERIMENTAL_BEGIN_FRAME_PUMP', 'PW_EXPERIMENTAL_BEGIN_FRAME_PUMP_DISPLAY'];

function setMode(env) {
  for (const key of ENV_KEYS)
    delete process.env[key];
  Object.assign(process.env, env);
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`PROBE-TIMEOUT(${label} ${ms}ms)`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function probeMode(name, env) {
  setMode(env);
  const result = { mode: name };
  const browser = await playwright.chromium.launch({ headless: true });
  let cdp;
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    // What binary/flags are we actually running?
    try {
      cdp = await browser.newBrowserCDPSession();
      const info = await withTimeout(cdp.send('SystemInfo.getProcessInfo'), 3000, 'getProcessInfo');
      const browserProc = info.processInfo.find(p => p.type === 'browser');
      result.processInfo = `${info.processInfo.length} procs (${info.processInfo.map(p => p.type).sort().join(',')})`;
      if (browserProc) {
        const cmd = execSync(`ps -p ${browserProc.id} -o command=`).toString().trim();
        result.binary = cmd.includes('headless_shell') ? 'headless_shell' : path.basename(cmd.split(' ')[0]);
        result.bfcFlag = cmd.includes('--enable-begin-frame-control');
      }
    } catch (e) {
      result.processInfo = 'FAIL: ' + e.message.split('\n')[0];
    }

    // 1. goto (load event without frames?)
    const t0 = Date.now();
    await withTimeout(page.goto('data:text/html,<button id=b onclick="window.__clicked=1">go</button><div id=s style="height:5000px"></div>'), 5000, 'goto');
    result.goto = `ok ${Date.now() - t0}ms`;

    // 2. evaluate + DOM timers
    const timer = await withTimeout(page.evaluate(() => new Promise(r => setTimeout(() => r('ok'), 50))), 3000, 'timers');
    result.timers = timer;

    // 3. rAF ticks in 600ms (with setTimeout escape hatch so it never hangs)
    result.rafTicks = await withTimeout(page.evaluate(() => new Promise(resolve => {
      let n = 0;
      const t0 = performance.now();
      const tick = () => { n++; if (performance.now() - t0 < 600) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      setTimeout(() => resolve(n), 700);
    })), 3000, 'raf');

    // 4. does the animation clock advance? (document.timeline.currentTime)
    result.timelineAdvanceMs = await withTimeout(page.evaluate(() => new Promise(resolve => {
      const t0 = document.timeline.currentTime;
      setTimeout(() => resolve(Math.round(document.timeline.currentTime - t0)), 500);
    })), 3000, 'timeline');

    // 5. locator click (actionability incl. 'stable' → needs rAF)
    try {
      const t = Date.now();
      await page.locator('#b').click({ timeout: 3000 });
      const clicked = await page.evaluate(() => window.__clicked);
      result.click = clicked ? `ok ${Date.now() - t}ms` : 'no-handler-fired';
    } catch (e) {
      result.click = e.constructor.name === 'TimeoutError' || e.message.includes('Timeout') ? 'TIMEOUT(stable-check)' : 'FAIL: ' + e.message.split('\n')[0];
    }

    // 6. force click (skips actionability)
    try {
      await page.evaluate(() => window.__clicked = 0);
      await page.locator('#b').click({ force: true, timeout: 3000 });
      result.forceClick = (await page.evaluate(() => window.__clicked)) ? 'ok' : 'no-handler-fired';
    } catch (e) {
      result.forceClick = 'FAIL: ' + e.message.split('\n')[0];
    }

    // 7. screenshot
    try {
      const t = Date.now();
      const buf = await page.screenshot({ timeout: 3000 });
      result.screenshot = `ok ${buf.length}b ${Date.now() - t}ms`;
    } catch (e) {
      result.screenshot = e.message.includes('Timeout') ? 'TIMEOUT' : 'FAIL: ' + e.message.split('\n')[0].slice(0, 60);
    }

    // 8. wheel scrolling
    try {
      await page.mouse.move(100, 100);
      await withTimeout(page.mouse.wheel(0, 1000), 3000, 'wheel');
      await new Promise(r => setTimeout(r, 300));
      result.scrollY = await withTimeout(page.evaluate(() => window.scrollY), 3000, 'scrollY');
    } catch (e) {
      result.scrollY = 'FAIL: ' + e.message.split('\n')[0].slice(0, 60);
    }
  } catch (e) {
    result.error = e.message.split('\n')[0];
  } finally {
    await browser.close().catch(() => {});
  }
  return result;
}

(async () => {
  const requested = process.argv.slice(2);
  const modes = requested.length ? requested : Object.keys(MODES);
  const rows = [];
  for (const mode of modes) {
    if (!MODES[mode]) { console.error(`unknown mode ${mode}`); continue; }
    console.log(`\n=== ${mode} ===`);
    const r = await probeMode(mode, MODES[mode]);
    console.log(JSON.stringify(r, null, 2));
    rows.push(r);
  }
  // summary table
  const cols = ['mode', 'binary', 'bfcFlag', 'goto', 'timers', 'rafTicks', 'timelineAdvanceMs', 'click', 'forceClick', 'screenshot', 'scrollY'];
  console.log('\n' + cols.join(' | '));
  for (const r of rows)
    console.log(cols.map(c => String(r[c] ?? '-')).join(' | '));
})();
