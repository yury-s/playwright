/**
 * Runs an interaction-heavy slice of the Playwright library test suite (tests/page)
 * in baseline vs begin-frame-control modes and compares wall time + pass counts.
 *
 * Screenshot/screencast tests are excluded — they are a known casualty of
 * disabling rendering.
 *
 * Usage: node no-render-bench/suite.js [baseline bfc-pump ...] [--workers=N] [--repeat=N]
 * Must run from the repo root (or REPO env). Linux only for bfc modes.
 */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const REPO = process.env.REPO || path.join(__dirname, '..');

const MODES = {
  'baseline': {},
  'bfc-only': { PW_EXPERIMENTAL_BEGIN_FRAME_CONTROL: '1' },
  'bfc-pump': { PW_EXPERIMENTAL_BEGIN_FRAME_CONTROL: '1', PW_EXPERIMENTAL_BEGIN_FRAME_PUMP: '16' },
};

const SPECS = [
  'tests/page/page-click.spec.ts',
  'tests/page/page-click-scroll.spec.ts',
  'tests/page/page-fill.spec.ts',
  'tests/page/page-keyboard.spec.ts',
  'tests/page/page-mouse.spec.ts',
  'tests/page/page-goto.spec.ts',
  'tests/page/page-evaluate.spec.ts',
  'tests/page/page-wait-for-selector-1.spec.ts',
  'tests/page/page-wait-for-selector-2.spec.ts',
  'tests/page/locator-click.spec.ts',
  'tests/page/locator-misc-1.spec.ts',
  'tests/page/locator-misc-2.spec.ts',
  'tests/page/elementhandle-click.spec.ts',
  'tests/page/elementhandle-type.spec.ts',
];

function runOnce(mode, workers) {
  return new Promise(resolve => {
    const existing = SPECS.filter(s => fs.existsSync(path.join(REPO, s)));
    const args = [
      'packages/playwright/cli.js', 'test',
      '--config=tests/library/playwright.config.ts',
      '--project=chromium-*',
      '--workers=' + workers,
      '--retries=0',
      '--reporter=dot',
      '--grep-invert', 'screenshot|Screenshot|screencast|video',
      ...existing,
    ];
    const t0 = Date.now();
    const child = spawn('node', args, {
      cwd: REPO,
      env: { ...process.env, ...MODES[mode], PWTEST_SKIP_TEST_OUTPUT: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', d => { output += d; });
    child.stderr.on('data', d => { output += d; });
    child.on('close', code => {
      const wallSec = (Date.now() - t0) / 1000;
      const passed = +(output.match(/(\d+) passed/) || [])[1] || 0;
      const failed = +(output.match(/(\d+) failed/) || [])[1] || 0;
      const flaky = +(output.match(/(\d+) flaky/) || [])[1] || 0;
      const skipped = +(output.match(/(\d+) skipped/) || [])[1] || 0;
      const didNotRun = +(output.match(/(\d+) did not run/) || [])[1] || 0;
      resolve({ mode, code, wallSec, passed, failed, flaky, skipped, didNotRun, output });
    });
  });
}

(async () => {
  const args = process.argv.slice(2);
  const workers = +((args.find(a => a.startsWith('--workers=')) || '').split('=')[1] || 4);
  const repeat = +((args.find(a => a.startsWith('--repeat=')) || '').split('=')[1] || 1);
  let modes = args.filter(a => !a.startsWith('--'));
  if (!modes.length)
    modes = ['baseline', 'bfc-pump'];

  const resultsDir = path.join(__dirname, 'results');
  fs.mkdirSync(resultsDir, { recursive: true });
  const summary = [];
  for (let iter = 0; iter < repeat; iter++) {
    for (const mode of modes) {
      if (!MODES[mode]) {
        console.error('unknown mode: ' + mode);
        continue;
      }
      process.stdout.write(`[iter ${iter}] ${mode} (workers=${workers})... `);
      const r = await runOnce(mode, workers);
      console.log(`${r.wallSec.toFixed(1)}s — ${r.passed} passed, ${r.failed} failed, ${r.flaky} flaky, ${r.skipped} skipped${r.didNotRun ? `, ${r.didNotRun} did not run` : ''}`);
      fs.writeFileSync(path.join(resultsDir, `suite-${mode}-iter${iter}.log`), r.output);
      const { output, ...rest } = r;
      summary.push({ iter, ...rest });
      if (r.failed) {
        const failures = [...r.output.matchAll(/^\s*\d+\)\s+(.+)$/gm)].map(m => m[1]).slice(0, 40);
        for (const f of failures)
          console.log('    FAIL: ' + f.trim());
      }
    }
  }
  fs.writeFileSync(path.join(resultsDir, 'suite-summary.json'), JSON.stringify(summary, null, 2));
  console.log('\nsummary written to results/suite-summary.json');
})();
