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

import { Semaphore } from '../../isomorphic/semaphore';
import { PlaywrightConnection } from '../../playwright-core/src/remote/playwrightConnection';
import { CRBrowser } from '../../playwright-core/src/server/chromium/crBrowser';
import { createPlaywright } from '../../playwright-core/src/server/playwright';
import { RecentLogsCollector } from '../../utils/debugLogger';
import { ChromeDebuggerTransport } from './chromeDebuggerTransport';

import type { BrowserOptions } from '../../playwright-core/src/server/browser';
import type { ServerTransport } from '../../playwright-core/src/remote/serverTransport';

class ExtensionWebSocketServerTransport implements ServerTransport {
  private _messageHandlers: Array<(message: string) => void> = [];
  private _closeHandlers: Array<() => void> = [];
  private _errorHandlers: Array<(error: Error) => void> = [];
  private _closeEmitted = false;

  constructor(private _ws: WebSocket) {
    this._ws.addEventListener('message', event => {
      const message = String(event.data);
      if (message.length < 64 && message.includes('extension.pong')) {
        try {
          if (JSON.parse(message).method === 'extension.pong')
            return;
        } catch {
        }
      }
      for (const handler of this._messageHandlers)
        handler(message);
    });
    this._ws.addEventListener('close', () => this._emitClose());
    this._ws.addEventListener('error', () => {
      const error = new Error('WebSocket error');
      for (const handler of this._errorHandlers)
        handler(error);
      if (this._ws.readyState === WebSocket.OPEN)
        this._ws.close(1011, error.message);
      this._emitClose();
    });
  }

  send(message: string): void {
    if (this._ws.readyState === WebSocket.OPEN)
      this._ws.send(message);
  }

  close(reason?: { code: number, reason: string }): void {
    if (this._ws.readyState === WebSocket.CONNECTING || this._ws.readyState === WebSocket.OPEN)
      this._ws.close(reason?.code, reason?.reason);
  }

  on(event: 'message', handler: (message: string) => void): void;
  on(event: 'close', handler: () => void): void;
  on(event: 'error', handler: (error: Error) => void): void;
  on(event: 'message' | 'close' | 'error', handler: ((message: string) => void) | (() => void) | ((error: Error) => void)): void {
    if (event === 'message')
      this._messageHandlers.push(handler as (message: string) => void);
    else if (event === 'close')
      this._closeHandlers.push(handler as () => void);
    else
      this._errorHandlers.push(handler as (error: Error) => void);
  }

  isClosed(): boolean {
    return this._closeEmitted || this._ws.readyState !== WebSocket.OPEN;
  }

  private _emitClose(): void {
    if (this._closeEmitted)
      return;
    this._closeEmitted = true;
    for (const handler of this._closeHandlers)
      handler();
  }
}

export class ExtensionPlaywrightServer {
  private _playwright = createPlaywright({
    sdkLanguage: 'javascript',
    isServer: true,
    isClientCollocatedWithServer: false,
  });
  private _connectionSemaphore = new Semaphore(Number.MAX_SAFE_INTEGER);
  private _lastConnectionId = 0;
  private _transport: ChromeDebuggerTransport | undefined;
  private _browser: CRBrowser | undefined;
  private _startPromise: Promise<void> | undefined;
  private _connections = new Set<PlaywrightConnection>();
  private _closing = false;

  ontabattached?: (tabId: number) => void;
  ontabdetached?: (tabId: number) => void;
  onstatechange?: () => void;
  onempty?: () => void;

  get attachedTabs(): ReadonlySet<number> {
    return this._transport?.attachedTabs ?? new Set();
  }

  get hasPendingReattach(): boolean {
    return !!this._transport?.hasPendingReattach;
  }

  async addTab(tab: chrome.tabs.Tab): Promise<void> {
    if (!this._transport) {
      this._transport = new ChromeDebuggerTransport();
      this._transport.ontabattached = tabId => this.ontabattached?.(tabId);
      this._transport.ontabdetached = tabId => this.ontabdetached?.(tabId);
      this._transport.onstatechange = () => this.onstatechange?.();
    }
    await this._transport.addTab(tab);
    this._startPromise ??= this._start();
    try {
      await this._startPromise;
    } catch (error) {
      if (!this._browser) {
        this._transport?.close();
        this._transport = undefined;
        this._startPromise = undefined;
      }
      throw error;
    }
  }

  removeTab(tabId: number): void {
    this._transport?.removeTab(tabId);
  }

  accept(ws: WebSocket, onclose: () => void): void {
    const browser = this._browser;
    if (!browser)
      throw new Error('Playwright extension server is not initialized');
    const transport = new ExtensionWebSocketServerTransport(ws);
    const connection = new PlaywrightConnection(
        this._connectionSemaphore,
        transport,
        false,
        this._playwright,
        async () => ({
          preLaunchedBrowser: browser,
          sharedBrowser: true,
          denyLaunch: true,
        }),
        `extension-${++this._lastConnectionId}`,
    );
    this._connections.add(connection);
    transport.on('close', () => {
      const didClose = () => {
        this._connections.delete(connection);
        onclose();
        if (!this._closing && !this._connections.size)
          this.onempty?.();
      };
      void connection.close().then(didClose, didClose);
    });
  }

  close(reason: string): void {
    if (this._closing)
      return;
    this._closing = true;
    for (const connection of this._connections)
      void connection.close({ code: 1000, reason });
    this._transport?.close();
    this._transport = undefined;
    this._browser = undefined;
    this._startPromise = undefined;
  }

  private async _start(): Promise<void> {
    const transport = this._transport!;
    const closeTransport = async () => transport.close();
    const browserOptions: BrowserOptions = {
      name: 'chromium',
      browserType: 'chromium',
      persistent: {
        noDefaultViewport: true,
        acceptDownloads: 'internal-browser-default',
      },
      browserProcess: {
        close: closeTransport,
        kill: closeTransport,
      },
      protocolLogger: () => {},
      browserLogsCollector: new RecentLogsCollector(),
      artifactsDir: '/playwright-artifacts',
      downloadsPath: '/playwright-artifacts',
      tracesDir: '/playwright-artifacts',
      originalLaunchOptions: {},
      noDefaults: true,
    };
    this._browser = await CRBrowser.connect(this._playwright, transport, browserOptions);
  }
}
