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

import fs from 'fs';
import http from 'http';
import net from 'net';
import path from 'path';

import { Registry } from './registry';
import { SocketConnection } from './socketConnection';

import type { SessionConfig } from './registry';

type SessionInfoResult = {
  name: string;
  workspace: string;
  browser: string;
  devtoolsUrl: string;
  status: string;
};

export class SessionsViewController {
  private _devtoolsUrlCache = new Map<string, string>();

  async start(options: { port?: number } = {}): Promise<string> {
    const port = options.port || 0;
    const staticDir = path.join(__dirname, '../../../../playwright-core/lib/vite/sessions-view');

    const server = http.createServer(async (req, res) => {
      if (req.url === '/api/sessions') {
        res.setHeader('Content-Type', 'application/json');
        try {
          const sessions = await this._discoverSessions();
          res.end(JSON.stringify(sessions));
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: (e as Error).message }));
        }
        return;
      }

      // Serve static files.
      let filePath = req.url || '/';
      if (filePath === '/')
        filePath = '/index.html';

      const fullPath = path.join(staticDir, filePath);
      // Prevent path traversal.
      if (!fullPath.startsWith(staticDir)) {
        res.statusCode = 403;
        res.end('Forbidden');
        return;
      }

      try {
        const stat = await fs.promises.stat(fullPath);
        if (!stat.isFile()) {
          // For SPA routing, serve index.html for non-file paths.
          const indexPath = path.join(staticDir, 'index.html');
          const content = await fs.promises.readFile(indexPath);
          res.setHeader('Content-Type', 'text/html');
          res.end(content);
          return;
        }
        const content = await fs.promises.readFile(fullPath);
        res.setHeader('Content-Type', mimeType(fullPath));
        res.end(content);
      } catch {
        // Fallback to index.html for SPA routing.
        try {
          const indexPath = path.join(staticDir, 'index.html');
          const content = await fs.promises.readFile(indexPath);
          res.setHeader('Content-Type', 'text/html');
          res.end(content);
        } catch {
          res.statusCode = 404;
          res.end('Not Found');
        }
      }
    });

    return new Promise((resolve, reject) => {
      server.on('error', reject);
      server.listen(port, () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Failed to get server address'));
          return;
        }
        resolve(`http://localhost:${address.port}`);
      });
    });
  }

  private async _discoverSessions(): Promise<SessionInfoResult[]> {
    const registry = await Registry.load();
    const configMap = registry.configMap();
    const results: SessionInfoResult[] = [];

    for (const [workspace, configs] of configMap) {
      for (const config of configs) {
        const canConnect = await this._canConnect(config);
        if (!canConnect)
          continue;

        let devtoolsUrl = '';
        const cacheKey = config.socketPath;
        if (this._devtoolsUrlCache.has(cacheKey)) {
          devtoolsUrl = this._devtoolsUrlCache.get(cacheKey)!;
        } else {
          try {
            devtoolsUrl = await this._startDevtools(config);
            this._devtoolsUrlCache.set(cacheKey, devtoolsUrl);
          } catch {
            // Session may have closed between discovery and devtools-start.
          }
        }

        results.push({
          name: config.name,
          workspace,
          browser: config.cli.browser || config.resolvedConfig?.browser.launchOptions.channel || config.resolvedConfig?.browser.browserName || '',
          devtoolsUrl,
          status: devtoolsUrl ? 'connected' : 'error',
        });
      }
    }

    return results;
  }

  private async _canConnect(config: SessionConfig): Promise<boolean> {
    return new Promise(resolve => {
      const socket = net.createConnection(config.socketPath, () => {
        socket.destroy();
        resolve(true);
      });
      socket.on('error', () => resolve(false));
    });
  }

  private async _startDevtools(config: SessionConfig): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(config.socketPath, () => {
        const connection = new SocketConnection(socket, config.version);
        const messageId = 1;
        const message = {
          id: messageId,
          method: 'devtools-start',
          params: {},
          version: config.version,
        };

        connection.onmessage = (msg: any) => {
          connection.close();
          if (msg.error)
            reject(new Error(msg.error));
          else
            resolve(msg.result.url);
        };

        connection.send(message);
      });
      socket.on('error', (e) => reject(e));
    });
  }
}

function mimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const types: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  };
  return types[ext] || 'application/octet-stream';
}
