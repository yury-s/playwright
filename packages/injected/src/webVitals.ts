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

// Page-side wrapper around Google's `web-vitals` library. Calibration logic
// (LCP, CLS, FCP, INP, TTFB) lives in that library, not here. We only stash
// metrics on a private global the reader can pick up later.

import { onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals';

import type { Metric } from 'web-vitals';

const STATE_KEY = '__pw_web_vitals_state__';
const INSTALLED_KEY = '__pw_web_vitals_installed__';

type CollectedMetric = {
  name: string;
  value: number;
  rating: string;
  id: string;
};

type State = {
  metrics: Record<string, CollectedMetric>;
};

export type VitalsReport = {
  url: string;
  ttfb: number | null;
  lcp: number | null;
  cls: number | null;
  fcp: number | null;
  inp: number | null;
  ratings: Record<string, string>;
  installed: boolean;
};

function getState(): State {
  // eslint-disable-next-line no-restricted-globals
  const g = globalThis as unknown as Record<string, unknown>;
  let state = g[STATE_KEY] as State | undefined;
  if (!state) {
    state = { metrics: {} };
    g[STATE_KEY] = state;
  }
  return state;
}

function record(metric: Metric) {
  const state = getState();
  state.metrics[metric.name] = {
    name: metric.name,
    value: Math.round(metric.value * 100) / 100,
    rating: metric.rating,
    id: metric.id,
  };
}

export class WebVitals {
  install() {
    // eslint-disable-next-line no-restricted-globals
    const g = globalThis as unknown as Record<string, unknown>;
    if (g[INSTALLED_KEY])
      return;
    g[INSTALLED_KEY] = true;
    onCLS(record);
    onFCP(record);
    onINP(record);
    onLCP(record);
    onTTFB(record);
  }

  read(): VitalsReport {
    // eslint-disable-next-line no-restricted-globals
    const g = globalThis as unknown as Record<string, unknown>;
    const installed = !!g[INSTALLED_KEY];
    const state = getState();
    const m = state.metrics;
    const ratings: Record<string, string> = {};
    for (const [name, metric] of Object.entries(m))
      ratings[name] = metric.rating;
    return {
      url: location.href,
      ttfb: m.TTFB ? m.TTFB.value : null,
      lcp: m.LCP ? m.LCP.value : null,
      cls: m.CLS ? m.CLS.value : null,
      fcp: m.FCP ? m.FCP.value : null,
      inp: m.INP ? m.INP.value : null,
      ratings,
      installed,
    };
  }
}
