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

import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { defineConfig, normalizePath } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: [
      { find: /^(node:)?events$/, replacement: resolve(__dirname, 'src/nodeStubs/events.cjs') },
      { find: /^(node:)?crypto$/, replacement: resolve(__dirname, 'src/nodeStubs/crypto.ts') },
      { find: /^(node:)?fs(\/promises)?$/, replacement: resolve(__dirname, 'src/nodeStubs/fs.ts') },
      { find: /^(node:)?path$/, replacement: resolve(__dirname, 'src/nodeStubs/path.ts') },
      { find: /^(node:)?os$/, replacement: resolve(__dirname, 'src/nodeStubs/os.ts') },
      { find: /^(node:)?buffer$/, replacement: resolve(__dirname, 'src/nodeStubs/buffer.ts') },
      { find: /^(node:)?process$/, replacement: resolve(__dirname, 'src/nodeStubs/processShim.ts') },
      { find: /^(node:)?https?$/, replacement: resolve(__dirname, 'src/nodeStubs/http.ts') },
      { find: /^(node:)?net$/, replacement: resolve(__dirname, 'src/nodeStubs/net.ts') },
      { find: /^(node:)?dns$/, replacement: resolve(__dirname, 'src/nodeStubs/dns.ts') },
      { find: /^(node:)?tls$/, replacement: resolve(__dirname, 'src/nodeStubs/tls.ts') },
      { find: /^(node:)?util$/, replacement: resolve(__dirname, 'src/nodeStubs/util.ts') },
      { find: /^(node:)?stream(\/promises)?$/, replacement: resolve(__dirname, 'src/nodeStubs/stream.ts') },
      { find: /^graceful-fs$/, replacement: resolve(__dirname, 'src/nodeStubs/fs.ts') },
      { find: /^kerberos$/, replacement: resolve(__dirname, 'src/nodeStubs/kerberos.ts') },
    ]
  },
  plugins: [
    {
      name: 'playwright-browser-package',
      enforce: 'pre',
      resolveId(source, importer) {
        if (!importer || !source.startsWith('.'))
          return;
        const resolvedSource = resolve(dirname(importer), source).replace(/\.ts$/, '');
        const packageModule = resolve(__dirname, '../playwright-core/src/package');
        if (resolvedSource === packageModule)
          return '\0playwright-browser-package';
      },
      load(id) {
        if (id !== '\0playwright-browser-package')
          return;
        return `
          export const packageRoot = '';
          export const packageJSON = { name: 'playwright-core', version: 'browser' };
          export const binPath = '';
          export function libPath() {
            throw new Error('Playwright package files are not available in the extension server');
          }
        `;
      },
    },
    {
      name: 'playwright-browser-registry',
      enforce: 'pre',
      transform(code, id) {
        const registryPath = resolve(__dirname, '../playwright-core/src/server/registry/index.ts');
        if (normalizePath(id.split('?')[0]) !== normalizePath(registryPath))
          return;
        const requireBrowsers = `require(path.join(packageRoot, 'browsers.json'))`;
        if (!code.includes(requireBrowsers))
          throw new Error('Could not find the Playwright browser registry initialization');
        const browsersJSONPath = resolve(__dirname, '../playwright-core/browsers.json');
        this.addWatchFile(browsersJSONPath);
        const browsersJSON = readFileSync(browsersJSONPath, 'utf8');
        return code.replace(requireBrowsers, `(${browsersJSON})`);
      },
    },
    react(),
    viteStaticCopy({
      targets: [
        {
          src: '../../icons/*',
          dest: 'icons'
        },
        {
          src: '../../manifest.json',
          dest: '.'
        }
      ]
    })
  ],
  root: resolve(__dirname, 'src/ui'),
  builder: {},
  environments: {
    client: {
      build: {
        outDir: resolve(__dirname, 'dist/'),
        // The client environment builds first, so it owns cleaning stale chunks.
        // The service worker environment then appends its output below.
        emptyOutDir: true,
        minify: false,
        rollupOptions: {
          input: ['src/ui/connect.html', 'src/ui/status.html'],
          output: {
            manualChunks: undefined,
            entryFileNames: 'lib/ui/[name].js',
            chunkFileNames: 'lib/ui/[name].js',
            assetFileNames: 'lib/ui/[name].[ext]'
          }
        }
      }
    },
    sw: {
      consumer: 'client',
      build: {
        outDir: resolve(__dirname, 'dist/'),
        emptyOutDir: false,
        minify: false,
        lib: {
          entry: resolve(__dirname, 'src/background.ts'),
          fileName: 'lib/background',
          formats: ['es']
        }
      }
    }
  }
});
