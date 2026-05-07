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

import * as z from 'zod';

import { defineTabTool } from './tool';
import * as rawWebVitalsSource from '../../generated/webVitalsSource';

import type { VitalsReport } from '../../../../injected/src/webVitals';

const WEB_VITALS_SOURCE = rawWebVitalsSource.source;

function expressionFor(method: string): string {
  return `(() => {
    const module = { exports: {} };
    ${WEB_VITALS_SOURCE};
    const script = new (module.exports.WebVitals())();
    return script.${method}();
  })()`;
}

function formatVitals(data: VitalsReport, justInstalled: boolean): string {
  const lines: string[] = [];
  lines.push(`# Page Load Profile - ${data.url}`);
  lines.push('');
  lines.push('## Core Web Vitals');
  const row = (label: string, value: number | null, unit: string) => {
    const rating = data.ratings[label];
    const ratingStr = rating ? ` [${rating}]` : '';
    lines.push(`  ${label.padEnd(4)} ${value !== null ? `${value}${unit}` : '-'}${ratingStr}`);
  };
  row('TTFB', data.ttfb, 'ms');
  row('LCP', data.lcp, 'ms');
  row('CLS', data.cls, '');
  row('FCP', data.fcp, 'ms');
  row('INP', data.inp, 'ms');
  if (justInstalled)
    lines.push('\n_Note: vitals init script was just installed; reload the page for full metrics including LCP/FCP._');
  return lines.join('\n');
}

const webVitals = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_web_vitals',
    title: 'Core Web Vitals',
    description: 'Capture Core Web Vitals (LCP, CLS, FCP, INP, TTFB) for the current page using Google\'s web-vitals library. The first call installs an init script and reports partial buffered metrics; for full metrics, reload the page after the first call.',
    inputSchema: z.object({
      filename: z.string().optional().describe('Save report to a markdown file instead of returning it inline.'),
    }),
    type: 'readOnly',
  },

  handle: async (tab, params, response) => {
    try {
      const installed = await tab.page.evaluate('!!window.__pw_web_vitals_installed__').catch(() => false);
      if (!installed) {
        const ctx = await tab.context.ensureBrowserContext();
        await ctx.addInitScript({ content: expressionFor('install') + ';' });
        // Best-effort live install on the current page; misses already-fired entries.
        await tab.page.evaluate(expressionFor('install')).catch(() => {});
      }
      const data = await tab.page.evaluate<VitalsReport>(expressionFor('read'));
      const text = formatVitals(data, !installed);
      await response.addResult('Web vitals', text, { prefix: 'web-vitals', ext: 'md', suggestedFilename: params.filename });
    } catch (e) {
      response.addError(e instanceof Error ? e.message : String(e));
    }
  },
});

export default [
  webVitals,
];
