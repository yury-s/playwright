/**
 * Image codec benchmark: JS (pngjs / jpeg-js) vs WASM (jSquash).
 *
 * Measures decode + encode throughput and output size for PNG, JPEG and WebP
 * across two content profiles (low-entropy "UI" and high-entropy "photo"),
 * to evaluate replacing Playwright's bundled pngjs/jpeg-js with WASM codecs.
 *
 * Run:  npm install && node bench.mjs
 *
 * Notes baked in from the investigation:
 *  - pngjs's PNG constructor ignores a `data` option (it allocates a zeroed
 *    buffer), so png.data must be assigned explicitly to carry real pixels.
 *  - @jsquash/png's encoder skips PNG row-filter selection -> ~10x bloat.
 *    The size-competitive WASM PNG encoder is @jsquash/oxipng `optimise_raw`
 *    at level 0 (RGBA -> PNG in a single call), which matches pngjs speed and
 *    produces smaller files.
 *  - All WASM codecs are async at the wrapper level, but the underlying
 *    encode/decode is synchronous once a precompiled WebAssembly.Module is
 *    handed to init() (done here at startup).
 */
import { PNG } from 'pngjs';
import jpegjs from 'jpeg-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

import pngDecode, { init as pngDecodeInit } from '@jsquash/png/decode.js';
import pngEncode, { init as pngEncodeInit } from '@jsquash/png/encode.js';
import jpegDecode, { init as jpegDecodeInit } from '@jsquash/jpeg/decode.js';
import jpegEncode, { init as jpegEncodeInit } from '@jsquash/jpeg/encode.js';
import webpDecode, { init as webpDecodeInit } from '@jsquash/webp/decode.js';
import webpEncode, { init as webpEncodeInit } from '@jsquash/webp/encode.js';
import initOxipng, { optimise_raw as oxipngEncodeRaw } from '@jsquash/oxipng/codec/pkg/squoosh_oxipng.js';

// Resolve wasm assets relative to this script so it runs from any cwd.
const wasm = rel => new WebAssembly.Module(readFileSync(fileURLToPath(new URL(rel, import.meta.url))));

await pngDecodeInit(wasm('./node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm'));
await pngEncodeInit(wasm('./node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm'));
await jpegDecodeInit(wasm('./node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm'));
await jpegEncodeInit(wasm('./node_modules/@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm'));
await webpDecodeInit(wasm('./node_modules/@jsquash/webp/codec/dec/webp_dec.wasm'));
await webpEncodeInit(wasm('./node_modules/@jsquash/webp/codec/enc/webp_enc_simd.wasm'));
await initOxipng(wasm('./node_modules/@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm'));

// ---------------------------------------------------------------------------
// Deterministic image generators (RGBA buffers).
// ---------------------------------------------------------------------------
function uiLike(w, h) { // low entropy: flat fills + bars + "text" runs
  const d = Buffer.alloc(w * h * 4, 255);
  const put = (x, y, r, g, b) => { const i = (y * w + x) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; };
  for (let x = 0; x < w; x++) for (let y = 0; y < 56; y++) put(x, y, 33, 66, 120);     // header
  for (let x = 0; x < 240; x++) for (let y = 56; y < h; y++) put(x, y, 244, 245, 247); // sidebar
  let s = 1234567;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let row = 80; row < h; row += 26) {
    let x = 260;
    while (x < w - 40) {
      const wlen = 12 + ((rnd() * 60) | 0);
      for (let dx = 0; dx < wlen && x + dx < w; dx++) for (let yy = 0; yy < 11; yy++) put(x + dx, row + yy, 40, 40, 44);
      x += wlen + 8 + ((rnd() * 10) | 0);
    }
  }
  return { width: w, height: h, data: d };
}
function photoLike(w, h) { // high entropy: gradients + waves + noise
  const d = Buffer.alloc(w * h * 4);
  let s = 987654321;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const wave = Math.sin(x / 37) * 40 + Math.cos(y / 53) * 40;
    const n = (rnd() - 0.5) * 36;
    d[i] = clamp((x / w) * 255 + wave + n);
    d[i + 1] = clamp((y / h) * 255 + wave * 0.7 + n);
    d[i + 2] = clamp(128 + wave + n);
    d[i + 3] = 255;
  }
  return { width: w, height: h, data: d };
}
const clamp = v => Math.max(0, Math.min(255, v));

// ImageData-shaped view for the WASM codecs (no copy).
const toImageData = img => ({ data: new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.length), width: img.width, height: img.height });

// pngjs needs png.data assigned explicitly (constructor ignores options.data).
function pngjsWrite(img) {
  const png = new PNG({ width: img.width, height: img.height });
  img.data.copy(png.data);
  return PNG.sync.write(png);
}

// ---------------------------------------------------------------------------
// Bench harness: warmup + adaptive iteration count targeting ~1.5s, median.
// ---------------------------------------------------------------------------
async function bench(fn) {
  for (let i = 0; i < 2; i++) await fn();
  const probe = performance.now(); const out = await fn(); const one = performance.now() - probe;
  const iters = Math.max(5, Math.min(60, Math.round(1500 / Math.max(one, 1))));
  const times = [];
  for (let i = 0; i < iters; i++) { const t = performance.now(); await fn(); times.push(performance.now() - t); }
  times.sort((a, b) => a - b);
  return { median: times[times.length >> 1], iters, bytes: out?.byteLength ?? out?.length };
}

const profiles = [
  { tag: 'UI 1280x720 (low entropy)', img: uiLike(1280, 720) },
  { tag: 'photo 1920x1080 (high entropy)', img: photoLike(1920, 1080) },
];

for (const { tag, img } of profiles) {
  const id = toImageData(img);
  // Encoded reference inputs for the decode benches.
  const pngBuf = pngjsWrite(img);
  const jpgBuf = jpegjs.encode(img, 80).data;
  const webpBuf = Buffer.from(await webpEncode(id, { quality: 80 }));

  console.log(`\n======================================================================`);
  console.log(`  ${tag}`);
  console.log(`======================================================================`);

  const lines = [];
  const row = (op, js, wasm) => lines.push({ op, js, wasm });

  // -- decode --
  row('PNG  decode',
    await bench(() => PNG.sync.read(pngBuf)),
    await bench(() => pngDecode(pngBuf)));
  row('JPEG decode',
    await bench(() => jpegjs.decode(jpgBuf, { maxMemoryUsageInMB: 1024 })),
    await bench(() => jpegDecode(jpgBuf)));
  row('WEBP decode',
    null,
    await bench(() => webpDecode(webpBuf)));

  // -- encode --
  row('PNG  encode',
    await bench(() => pngjsWrite(img)),
    await bench(() => oxipngEncodeRaw(id.data, img.width, img.height, 0, false, false))); // oxipng_raw level 0
  row('JPEG encode q80',
    await bench(() => jpegjs.encode(img, 80).data),
    await bench(() => jpegEncode(id, { quality: 80 })));
  row('WEBP encode q80',
    null,
    await bench(() => webpEncode(id, { quality: 80 })));

  console.log('  operation          JS (median)        WASM (median)      speedup   out: JS -> WASM');
  console.log('  ' + '-'.repeat(86));
  for (const { op, js, wasm } of lines) {
    const jsMs = js ? `${js.median.toFixed(1)} ms`.padStart(11) : '         — ';
    const wMs = `${wasm.median.toFixed(1)} ms`.padStart(11);
    const speed = js ? `${(js.median / wasm.median).toFixed(1)}x`.padStart(7) : '   new ';
    const sizes = js?.bytes ? `${kb(js.bytes)} -> ${kb(wasm.bytes)}` : (wasm.bytes ? `${kb(wasm.bytes)}` : '');
    console.log(`  ${op.padEnd(17)} ${jsMs}        ${wMs}      ${speed}   ${sizes}`);
  }
}

function kb(bytes) { return bytes != null ? `${(bytes / 1024).toFixed(1)}KB` : ''; }

console.log(`
Legend: speedup = JS_median / WASM_median (>1 = WASM faster). "out" = encoded
output size for encode rows / input size for decode rows. PNG encode WASM is
oxipng optimise_raw at level 0. JPEG/WebP encode quality 80.
`);
