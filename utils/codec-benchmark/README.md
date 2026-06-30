# Image codec benchmark — JS (pngjs/jpeg-js) vs WASM (jSquash)

Evaluates replacing Playwright's bundled JS image codecs (`pngjs`, `jpeg-js`)
with WASM codecs from [jSquash](https://github.com/jamsinclair/jSquash) (the
Squoosh codecs: libpng/oxipng, mozjpeg, libwebp), and adding WebP support.

## Run

```bash
cd utils/codec-benchmark
npm install
node bench.mjs
```

It generates two deterministic RGBA images — a low-entropy "UI" frame
(1280×720, flat fills + text runs, like a typical `toHaveScreenshot` target)
and a high-entropy "photo" frame (1920×1080, gradients + noise) — then times
decode and encode for PNG/JPEG/WebP and reports median latency and output size.

## Results (Node v24, single sample run)

Numbers vary by machine; the **ratios** are the point.

### UI 1280×720 (low entropy)

| operation | JS | WASM | speedup | output JS → WASM |
|---|--:|--:|--:|---|
| PNG decode | 21.8 ms | 9.6 ms | **2.3× faster** | — |
| JPEG decode | 69.0 ms | 9.7 ms | **7.1× faster** | — |
| WebP decode | — | 12.4 ms | new | — |
| PNG encode | 74.0 ms | 79.0 ms | 0.9× | 8.4 KB → **3.0 KB** |
| JPEG encode q80 | 52.7 ms | 134.8 ms | 0.4× (slower) | 132.5 KB → **72.7 KB** |
| WebP encode q80 | — | 85.0 ms | new | 17.8 KB |

### photo 1920×1080 (high entropy)

| operation | JS | WASM | speedup | output JS → WASM |
|---|--:|--:|--:|---|
| PNG decode | 107.4 ms | 64.1 ms | **1.7× faster** | — |
| JPEG decode | 214.8 ms | 31.4 ms | **6.8× faster** | — |
| WebP decode | — | 67.0 ms | new | — |
| PNG encode | 295.0 ms | 320.7 ms | 0.9× | 4.9 MB → **3.5 MB** |
| JPEG encode q80 | 168.7 ms | 529.0 ms | 0.3× (slower) | 497.8 KB → **297.6 KB** |
| WebP encode q80 | — | 363.2 ms | new | 455.3 KB |

## Conclusions

- **Decode is a clear WASM win**, and it is the hot path: `compareImages`
  (`toHaveScreenshot` / `toMatchSnapshot`) decodes *both* images on every
  assertion. PNG decode 1.7–2.3× faster, JPEG decode **7×** faster. WASM decode
  also unlocks WebP decode, which the MCP resize path
  (`scaleImageToFitMessage`) bails on today.
- **PNG encode reaches parity** using `@jsquash/oxipng`'s `optimise_raw` at
  **level 0** (RGBA → PNG in one call): ~same speed as pngjs and meaningfully
  **smaller** files, losslessly (roundtrip verified). Note: the plain
  `@jsquash/png` encoder skips row-filter selection and produces ~10× larger
  files — it is *not* a drop-in; oxipng is required for size parity.
- **JPEG encode is slower** with WASM (mozjpeg, ~3×) but produces ~1.7×
  smaller files at the same nominal quality. Playwright's JPEG-encode call
  sites are all minor (video placeholder frame, WebKit webview screenshot,
  MCP resize), so the slowdown is low-impact.

## Bundle / disk size

WASM ships as separate binary assets — it does **not** inline into
`utilsBundle.js` (which shrinks ~122 KB when pngjs+jpeg-js are removed). The
package's on-disk footprint grows:

| | JS glue | WASM | total |
|---|--:|--:|--:|
| **Remove** pngjs + jpeg-js | ~122 KB | — | −122 KB |
| `@jsquash/png` (decode) | 13 KB | 176 KB | +190 KB |
| `@jsquash/oxipng` (encode) | 23 KB | 164 KB (ST) | +187 KB |
| `@jsquash/jpeg` (dec+enc) | 78 KB | 408 KB | +486 KB |
| `@jsquash/webp` (dec+enc) | 115 KB | 484 KB+ | +486 KB |

Full PNG+JPEG elimination ≈ **+740 KB** on disk; adding WebP ≈ **+1.2 MB**.

## Implementation notes

- jSquash wrappers are `async` (WASM instantiation), but the underlying
  encode/decode is **synchronous** once a precompiled `WebAssembly.Module` is
  passed to `init()`. So the synchronous `Comparator` API in
  `packages/utils/comparators.ts` can be preserved by instantiating the codecs
  once at module load — no async ripple through the expect matchers.
- `pngjs`'s `PNG` constructor ignores a `data` option (it allocates a zeroed
  buffer); `png.data` must be assigned explicitly. Getting this wrong silently
  benchmarks a blank image.
