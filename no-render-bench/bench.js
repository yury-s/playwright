/**
 * Benchmark: Chromium headless shell with rendering disabled via BeginFrameControl.
 *
 * Modes:
 *   baseline       — stock Playwright headless shell (internal frame production)
 *   bfc-only       — --enable-begin-frame-control --run-all-compositor-stages-before-draw,
 *                    no frames ever issued: rendering AND rAF are completely dead
 *   bfc-pump       — same flags + CRPage pumps HeadlessExperimental.beginFrame
 *                    { noDisplayUpdates: true } every 16ms: rAF/layout/animations run,
 *                    commit/raster/draw are skipped
 *   bfc-pump-disp  — pump with noDisplayUpdates: false: full frame per pump
 *
 * BeginFrameControl only works on Linux/Windows headless shell (not macOS).
 * Run inside a Linux container on mac hosts.
 *
 * Usage: node bench.js [all | mode ...] [--scenario=<name>] [--out=<file>]
 */
'use strict';
const path = require('path');
const http = require('http');
const fs = require('fs');

const playwright = require(path.join(__dirname, '..', 'packages', 'playwright-core'));

const MODES = {
  'baseline': {},
  'bfc-only': { PW_EXPERIMENTAL_BEGIN_FRAME_CONTROL: '1' },
  'bfc-pump': { PW_EXPERIMENTAL_BEGIN_FRAME_CONTROL: '1', PW_EXPERIMENTAL_BEGIN_FRAME_PUMP: '16' },
  'bfc-pump-disp': { PW_EXPERIMENTAL_BEGIN_FRAME_CONTROL: '1', PW_EXPERIMENTAL_BEGIN_FRAME_PUMP: '16', PW_EXPERIMENTAL_BEGIN_FRAME_PUMP_DISPLAY: '1' },
};
const ENV_KEYS = ['PW_EXPERIMENTAL_BEGIN_FRAME_CONTROL', 'PW_EXPERIMENTAL_BEGIN_FRAME_PUMP', 'PW_EXPERIMENTAL_BEGIN_FRAME_PUMP_DISPLAY'];

// ---------------------------------------------------------------------------
// Scenario pages
// ---------------------------------------------------------------------------

const pages = {
  '/blank': () => `<title>blank</title><h1>hello</h1>`,

  '/article': () => {
    const paras = [];
    for (let i = 0; i < 60; i++)
      paras.push(`<p style="margin:8px; padding:4px; border-left:3px solid #ccc">Paragraph ${i}: ${'lorem ipsum dolor sit amet consectetur '.repeat(8)}</p>`);
    const boxes = [];
    for (let i = 0; i < 40; i++)
      boxes.push(`<div style="display:inline-block;width:60px;height:60px;margin:4px;background:hsl(${i * 9},70%,60%);border-radius:8px;box-shadow:2px 2px 6px rgba(0,0,0,.3)"></div>`);
    return `<title>article</title><h1>Article</h1>${boxes.join('')}${paras.join('')}`;
  },

  '/grid': () => {
    const buttons = [];
    for (let i = 0; i < 100; i++)
      buttons.push(`<button id="b${i}" onclick="window.__clicks=(window.__clicks||0)+1" style="width:70px;height:34px;margin:2px">b${i}</button>`);
    return `<title>grid</title><style>button:hover{background:#8cf}button:active{background:#c00}</style><div>${buttons.join('')}</div>`;
  },

  '/form': () => {
    const inputs = [];
    for (let i = 0; i < 10; i++)
      inputs.push(`<input id="i${i}" style="display:block;margin:6px;width:300px;padding:6px">`);
    return `<title>form</title>${inputs.join('')}<textarea id="ta" rows=10 cols=60></textarea>`;
  },

  '/anim-css': () => {
    const spinners = [];
    for (let i = 0; i < 250; i++)
      spinners.push(`<div class="spin" style="left:${(i * 17) % 1200}px;top:${(i * 31) % 600}px;background:hsl(${i * 7},80%,55%);animation-delay:${(i % 16) * 60}ms"></div>`);
    const movers = [];
    for (let i = 0; i < 80; i++)
      movers.push(`<div class="move" style="top:${i * 9}px;background:hsl(${i * 11},60%,45%)"></div>`);
    return `<title>anim-css</title><style>
      .spin { position:absolute; width:40px; height:40px; border-radius:6px; animation: spin 1.3s linear infinite; will-change: transform, opacity; }
      @keyframes spin { 0% { transform: rotate(0) scale(.6); opacity:.4 } 50% { opacity: 1 } 100% { transform: rotate(360deg) scale(1.4); opacity:.4 } }
      .move { position:absolute; height:7px; animation: move 1.7s ease-in-out infinite alternate; }
      @keyframes move { from { left:0; width:60px } to { left:900px; width:260px } }
    </style>${spinners.join('')}${movers.join('')}
    <script>
      window.__frames = 0;
      const tick = () => { window.__frames++; requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    </script>`;
  },

  '/anim-canvas': () => `<title>anim-canvas</title><canvas id="c" width="1280" height="720"></canvas>
    <script>
      const ctx = document.getElementById('c').getContext('2d');
      window.__frames = 0;
      let seed = 7;
      const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
      const tick = () => {
        window.__frames++;
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, 1280, 720);
        for (let i = 0; i < 900; i++) {
          ctx.fillStyle = 'hsl(' + ((window.__frames * 3 + i * 5) % 360) + ',70%,55%)';
          if (i % 3) {
            ctx.fillRect(rnd() * 1240, rnd() * 680, 24 + rnd() * 40, 24 + rnd() * 40);
          } else {
            ctx.beginPath();
            ctx.arc(rnd() * 1280, rnd() * 720, 10 + rnd() * 25, 0, 6.28);
            ctx.fill();
          }
        }
        ctx.fillStyle = '#fff';
        ctx.font = '24px monospace';
        ctx.fillText('frame ' + window.__frames, 20, 40);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    </script>`,

  '/churn': () => `<title>churn</title><div id="root"></div>`,

  '/long': () => {
    const rows = [];
    for (let i = 0; i < 1500; i++)
      rows.push(`<div style="height:40px;border-bottom:1px solid #ddd;padding:4px;background:${i % 2 ? '#f8f8f8' : '#fff'}">row ${i} — ${'x'.repeat(i % 80)}</div>`);
    return `<title>long</title>${rows.join('')}`;
  },
};

function startServer() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const gen = pages[url.pathname];
      if (!gen) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
      res.end('<!DOCTYPE html>' + gen());
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

// ---------------------------------------------------------------------------
// Measurement helpers
// ---------------------------------------------------------------------------

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`SCENARIO-TIMEOUT(${label} ${ms}ms)`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function cpuSnapshot(cdp) {
  const { processInfo } = await cdp.send('SystemInfo.getProcessInfo');
  const map = new Map();
  for (const p of processInfo)
    map.set(p.id, { type: p.type, cpuTime: p.cpuTime });
  return map;
}

function cpuDelta(before, after) {
  const byType = {};
  let total = 0;
  for (const [id, p] of after) {
    const prev = before.get(id);
    const delta = Math.max(0, p.cpuTime - (prev ? prev.cpuTime : 0));
    byType[p.type] = (byType[p.type] || 0) + delta;
    total += delta;
  }
  return { total, byType };
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

const scenarios = {
  'nav-blank': async (page, base) => {
    for (let i = 0; i < 30; i++)
      await page.goto(`${base}/blank?i=${i}`);
    return { ops: 30 };
  },

  'nav-article': async (page, base) => {
    for (let i = 0; i < 20; i++)
      await page.goto(`${base}/article?i=${i}`);
    return { ops: 20 };
  },

  'click': async (page, base) => {
    await page.goto(`${base}/grid`);
    let timeouts = 0;
    let done = 0;
    for (let i = 0; i < 100; i++) {
      try {
        await page.locator(`#b${i}`).click({ timeout: 2000 });
        done++;
      } catch (e) {
        if (!e.message.includes('Timeout'))
          throw e;
        if (++timeouts >= 3)
          return { ops: done, timeouts, note: 'aborted after 3 action timeouts' };
      }
    }
    const clicks = await page.evaluate(() => window.__clicks);
    return { ops: done, timeouts, clicksRegistered: clicks };
  },

  'click-force': async (page, base) => {
    await page.goto(`${base}/grid`);
    for (let i = 0; i < 100; i++)
      await page.locator(`#b${i}`).click({ force: true, timeout: 5000 });
    const clicks = await page.evaluate(() => window.__clicks);
    return { ops: 100, clicksRegistered: clicks };
  },

  'fill': async (page, base) => {
    await page.goto(`${base}/form`);
    let timeouts = 0;
    let done = 0;
    for (let i = 0; i < 50; i++) {
      try {
        await page.locator(`#i${i % 10}`).fill(`value ${i}`, { timeout: 2000 });
        done++;
      } catch (e) {
        if (!e.message.includes('Timeout'))
          throw e;
        if (++timeouts >= 3)
          return { ops: done, timeouts, note: 'aborted after 3 action timeouts' };
      }
    }
    return { ops: done, timeouts };
  },

  'type': async (page, base) => {
    await page.goto(`${base}/form`);
    await page.locator('#ta').click({ force: true, timeout: 5000 });
    const typing = page.keyboard.type('The quick brown fox jumps over the lazy dog. '.repeat(6));
    typing.catch(() => {});
    const done = await Promise.race([typing.then(() => true), sleep(15000).then(() => false)]);
    if (!done)
      return { note: 'keyboard.type stalled' };
    const len = await page.evaluate(() => document.getElementById('ta').value.length);
    return { ops: 270, charsTyped: len };
  },

  'query': async (page, base) => {
    await page.goto(`${base}/grid`);
    for (let i = 0; i < 400; i++)
      await page.locator(`#b${i % 100}`).textContent({ timeout: 5000 });
    return { ops: 400 };
  },

  'anim-css': async (page, base) => {
    await page.goto(`${base}/anim-css`);
    const t0 = await page.evaluate(() => ({ frames: window.__frames, time: document.timeline.currentTime }));
    await sleep(4000);
    const t1 = await page.evaluate(() => ({ frames: window.__frames, time: document.timeline.currentTime }));
    return { holdMs: 4000, rafFps: Math.round((t1.frames - t0.frames) / 4), timelineAdvanceMs: Math.round(t1.time - t0.time) };
  },

  'anim-canvas': async (page, base) => {
    await page.goto(`${base}/anim-canvas`);
    const t0 = await page.evaluate(() => window.__frames);
    await sleep(4000);
    const t1 = await page.evaluate(() => window.__frames);
    return { holdMs: 4000, rafFps: Math.round((t1 - t0) / 4) };
  },

  'dom-churn': async (page, base) => {
    await page.goto(`${base}/churn`);
    for (let i = 0; i < 120; i++) {
      await page.evaluate(i => {
        const root = document.getElementById('root');
        const items = [];
        for (let j = 0; j < 1200; j++)
          items.push(`<li style="padding-left:${(i + j) % 30}px;color:hsl(${j % 360},50%,40%)">item ${i}-${j}</li>`);
        root.innerHTML = `<ul>${items.join('')}</ul>`;
        return root.offsetHeight; // force layout
      }, i);
    }
    return { ops: 120 };
  },

  'scroll': async (page, base) => {
    await page.goto(`${base}/long`);
    await page.mouse.move(400, 300);
    let stalled = false;
    let ops = 0;
    for (let i = 0; i < 60; i++) {
      const wheel = page.mouse.wheel(0, 700);
      wheel.catch(() => {});
      const done = await Promise.race([wheel.then(() => true), sleep(1500).then(() => false)]);
      if (!done) {
        stalled = true;
        break;
      }
      ops++;
      await sleep(15);
    }
    await sleep(300);
    const scrollY = await page.evaluate(() => window.scrollY).catch(() => -1);
    return { ops, scrollY, ...(stalled ? { note: 'mouse.wheel stalled' } : {}) };
  },

  'screenshot-probe': async (page, base) => {
    await page.goto(`${base}/article`);
    try {
      const buf = await page.screenshot({ timeout: 5000 });
      return { screenshot: `ok ${buf.length}b` };
    } catch (e) {
      return { screenshot: 'FAIL: ' + e.message.split('\n')[0].slice(0, 80) };
    }
  },
};

// ---------------------------------------------------------------------------
// Real-world scenarios (live sites — wall time includes network noise, CPU is
// the meaningful metric). Clicks fall back to force so that bfc-only can
// complete the same navigation sequence; fallbacks are recorded in steps.
// Scrolling uses PageDown because mouse.wheel stalls without submitted frames.
// ---------------------------------------------------------------------------

async function safeClick(page, locator, steps, name) {
  try {
    await locator.click({ timeout: 5000 });
    steps.push(name);
    return true;
  } catch (e) {
    try {
      await locator.click({ force: true, timeout: 3000 });
      steps.push(name + '(forced)');
      return true;
    } catch (e2) {
      steps.push(name + '(SKIPPED)');
      return false;
    }
  }
}

async function safeGoto(page, url, steps, name) {
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 25000 });
    await sleep(1000);
    steps.push(name);
    return true;
  } catch (e) {
    steps.push(name + '(FAILED:' + e.message.split('\n')[0].slice(0, 40) + ')');
    return false;
  }
}

async function pageDowns(page, n) {
  for (let i = 0; i < n; i++) {
    await page.keyboard.press('PageDown').catch(() => {});
    await sleep(200);
  }
}

const realScenarios = {
  'real-playwright-dev': async page => {
    const steps = [];
    await safeGoto(page, 'https://playwright.dev/', steps, 'home');
    await sleep(2000); // idle hold on landing page
    await safeClick(page, page.locator('a.navbar__item[href="/docs/intro"]').first(), steps, 'nav:Docs');
    await sleep(1000);
    await safeClick(page, page.locator('a[href="/docs/writing-tests"]').first(), steps, 'sidebar:writing-tests');
    await sleep(1000);
    await safeClick(page, page.locator('a[href="/docs/running-tests"]').first(), steps, 'sidebar:running-tests');
    await sleep(1000);
    await safeClick(page, page.locator('a[href="/docs/api/class-playwright"]').first(), steps, 'nav:API');
    await sleep(1000);
    await pageDowns(page, 4);
    await sleep(2000); // idle hold
    const scrollY = await page.evaluate(() => window.scrollY).catch(() => -1);
    return { steps: steps.join(' > '), scrollY };
  },

  'real-github': async page => {
    const steps = [];
    await safeGoto(page, 'https://github.com/', steps, 'home');
    await sleep(3000); // idle hold — the anonymous homepage is animation-heavy
    await pageDowns(page, 4);
    await sleep(2000);
    await safeGoto(page, 'https://github.com/microsoft/playwright', steps, 'repo');
    await safeClick(page, page.locator('#issues-tab'), steps, 'tab:Issues');
    await sleep(1500);
    await safeClick(page, page.locator('#pull-requests-tab'), steps, 'tab:PRs');
    await sleep(1500);
    await pageDowns(page, 3);
    await sleep(2000);
    const scrollY = await page.evaluate(() => window.scrollY).catch(() => -1);
    return { steps: steps.join(' > '), scrollY };
  },

  'real-google': async page => {
    const steps = [];
    await safeGoto(page, 'https://www.google.com/', steps, 'home');
    const consent = page.locator('button:has-text("Accept all"), button:has-text("I agree")').first();
    if (await consent.isVisible({ timeout: 1500 }).catch(() => false))
      await safeClick(page, consent, steps, 'consent');
    try {
      await page.locator('textarea[name="q"], input[name="q"]').first().fill('playwright browser automation', { timeout: 5000 });
      steps.push('fill:query');
      await page.keyboard.press('Enter');
      await page.waitForLoadState('load', { timeout: 15000 }).catch(() => {});
      await sleep(1500);
      steps.push('results:' + (await page.evaluate(() => !!document.querySelector('#search')).catch(() => false)));
    } catch (e) {
      steps.push('search(FAILED:' + e.message.split('\n')[0].slice(0, 40) + ')');
    }
    await pageDowns(page, 3);
    await sleep(2000);
    const scrollY = await page.evaluate(() => window.scrollY).catch(() => -1);
    const finalUrl = await page.evaluate(() => location.host + location.pathname).catch(() => '?');
    return { steps: steps.join(' > ') + ' @' + finalUrl, scrollY };
  },
};

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function setMode(env) {
  for (const key of ENV_KEYS)
    delete process.env[key];
  Object.assign(process.env, env);
}

async function runMode(modeName, base, scenarioFilter, group) {
  setMode(MODES[modeName]);
  console.log(`\n### mode: ${modeName}`);
  const browser = await playwright.chromium.launch({ headless: true });
  const cdp = await browser.newBrowserCDPSession();
  const results = {};
  const scenarioSet = group === 'real' ? realScenarios : group === 'all' ? { ...scenarios, ...realScenarios } : scenarios;
  const scenarioTimeout = group === 'synthetic' ? 90000 : 180000;

  // Warmup: first page/renderer spawn is expensive, keep it out of the numbers.
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${base}/blank`).catch(() => {});
    await sleep(300);
    await context.close();
  }

  for (const [name, fn] of Object.entries(scenarioSet)) {
    if (scenarioFilter && !name.includes(scenarioFilter))
      continue;
    const context = await browser.newContext();
    const page = await context.newPage();
    await sleep(150);
    const entry = { status: 'ok' };
    try {
      const cpu0 = await cpuSnapshot(cdp);
      const t0 = process.hrtime.bigint();
      const metrics = await withTimeout(fn(page, base), scenarioTimeout, name);
      entry.wallMs = Number(process.hrtime.bigint() - t0) / 1e6;
      const cpu1 = await cpuSnapshot(cdp);
      const { total, byType } = cpuDelta(cpu0, cpu1);
      entry.cpuSec = total;
      entry.cpuByType = byType;
      Object.assign(entry, metrics);
    } catch (e) {
      entry.status = e.message.startsWith('SCENARIO-TIMEOUT') ? 'hang' : 'error';
      entry.error = e.message.split('\n')[0].slice(0, 120);
    }
    results[name] = entry;
    const cpu = entry.cpuSec !== undefined ? ` cpu=${entry.cpuSec.toFixed(2)}s` : '';
    const wall = entry.wallMs !== undefined ? ` wall=${Math.round(entry.wallMs)}ms` : '';
    console.log(`  ${name}: ${entry.status}${wall}${cpu}${entry.rafFps !== undefined ? ` rafFps=${entry.rafFps}` : ''}${entry.timeouts ? ` timeouts=${entry.timeouts}` : ''}${entry.steps ? `\n      ${entry.steps} scrollY=${entry.scrollY}` : ''}${entry.error ? ' ' + entry.error : ''}`);
    await withTimeout(context.close(), 10000, 'context.close').catch(() => {});
  }

  await browser.close().catch(() => {});
  return results;
}

(async () => {
  const args = process.argv.slice(2);
  const scenarioFilter = (args.find(a => a.startsWith('--scenario=')) || '').split('=')[1];
  const outFile = (args.find(a => a.startsWith('--out=')) || '').split('=')[1];
  const group = (args.find(a => a.startsWith('--group=')) || '').split('=')[1] || 'synthetic';
  let modes = args.filter(a => !a.startsWith('--'));
  if (!modes.length || modes.includes('all'))
    modes = Object.keys(MODES);

  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}`;
  console.log(`server: ${base}  platform: ${process.platform}  cpus: ${require('os').cpus().length}`);

  const all = { meta: { platform: process.platform, arch: process.arch, cpus: require('os').cpus().length, date: new Date().toISOString() }, modes: {} };
  for (const mode of modes) {
    if (!MODES[mode]) {
      console.error(`unknown mode: ${mode}`);
      continue;
    }
    all.modes[mode] = await runMode(mode, base, scenarioFilter, group);
  }
  server.close();

  // Comparison table: wall ms and cpu s per scenario per mode.
  const modeNames = Object.keys(all.modes);
  const scenarioNames = [...new Set(modeNames.flatMap(m => Object.keys(all.modes[m])))];
  const fmt = (v, w) => String(v).padStart(w);
  console.log('\n=== wall ms (cpu s) ===');
  console.log(['scenario'.padEnd(18), ...modeNames.map(m => m.padStart(24))].join(''));
  for (const s of scenarioNames) {
    const cells = modeNames.map(m => {
      const r = all.modes[m][s];
      if (!r)
        return fmt('-', 24);
      if (r.status !== 'ok')
        return fmt(r.status.toUpperCase(), 24);
      return fmt(`${Math.round(r.wallMs)} (${r.cpuSec.toFixed(2)})`, 24);
    });
    console.log([s.padEnd(18), ...cells].join(''));
  }

  const out = outFile || path.join(__dirname, 'results', `bench-${process.platform}-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(all, null, 2));
  console.log(`\nresults written to ${out}`);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
