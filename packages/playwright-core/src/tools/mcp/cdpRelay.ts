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

/**
 * WebSocket server that bridges Playwright MCP and Chrome Extension.
 *
 * Endpoints:
 * - /cdp/guid - Full CDP interface for Playwright MCP
 * - /extension/guid - Extension connection
 *
 * The protocol version advertised to the extension can be overridden with the
 * PLAYWRIGHT_EXTENSION_PROTOCOL env variable (used in tests).
 */

import { spawn } from 'child_process';
import os from 'os';

import debug from 'debug';
import ws from 'ws';
import { ManualPromise } from '@isomorphic/manualPromise';
import { WSServer } from '@utils/wsServer';
import { registry } from '../../server/registry/index';

import { playwrightExtensionId } from '../utils/extension';
import { getPlaywrightVersion } from '../../server/userAgent';
import { logUnhandledError } from './log';
import { ExtensionProtocolV2 } from './cdpRelayV2';
import * as protocol from './protocol';

import type websocket from 'ws';
import type { ExtensionCommandV2, ExtensionEventsV2, ExtensionReadyMessage, ExtensionPongMessage } from './protocol';
import type { CDPMessage } from './browserModel';
import type { WebSocket } from 'ws';


const debugLogger = debug('pw:mcp:relay');

type CDPCommand = {
  id: number;
  sessionId?: string;
  method: string;
  params?: any;
};

type CDPResponse = CDPMessage;

export class CDPRelayServer {
  private _wsServer: WSServer;
  private _wsHost!: string;
  private _browserChannel: string;
  private _executablePath?: string;
  private _customUserDataDir?: string;
  private _profileDirectory?: string;
  private _cdpPath: string;
  private _extensionPath: string;
  private _cdpConnection: WebSocket | null = null;
  private _extensionConnection: ExtensionConnection | null = null;
  private _protocolVersion: number;
  private _handler: ExtensionProtocolV2;
  private _extensionConnectionPromise = new ManualPromise<void>();
  // Channel protocol (v3) only: raw extension socket used for unmodified
  // frame forwarding, and the readiness gate fulfilled by the extension's
  // 'extension.ready' control message.
  private _extensionSocket: WebSocket | null = null;
  private _extensionReadyPromise = new ManualPromise<void>();

  constructor(browserChannel: string, executablePath?: string, customUserDataDir?: string, profileDirectory?: string) {
    this._browserChannel = browserChannel;
    this._executablePath = executablePath;
    this._customUserDataDir = customUserDataDir;
    this._profileDirectory = profileDirectory;
    this._protocolVersion = parseInt(process.env.PLAYWRIGHT_EXTENSION_PROTOCOL ?? protocol.VERSION.toString(), 10);

    const sendCommand = (method: string, params: any): Promise<any> => {
      if (!this._extensionConnection)
        throw new Error('Extension not connected');
      return this._extensionConnection.send(method as keyof ExtensionCommandV2, params);
    };
    this._handler = new ExtensionProtocolV2(sendCommand);

    const uuid = crypto.randomUUID();
    this._cdpPath = `/cdp/${uuid}`;
    this._extensionPath = `/extension/${uuid}`;

    void this._extensionConnectionPromise.catch(logUnhandledError);
    void this._extensionReadyPromise.catch(logUnhandledError);
    this._wsServer = new WSServer({
      onRequest: (request, response) => {
        response.statusCode = 404;
        response.end();
      },
      onHeaders: () => {},
      onUpgrade: () => undefined,
      isAllowedPathname: pathname => pathname === this._cdpPath || pathname === this._extensionPath,
      onConnection: (request, url, ws) => {
        debugLogger(`New connection to ${url.pathname}`);
        if (url.pathname === this._cdpPath)
          this._handlePlaywrightConnection(ws);
        else
          this._handleExtensionConnection(ws);
        return undefined;
      },
    });
  }

  async start(): Promise<void> {
    this._wsHost = await this._wsServer.listen(0, undefined, '');
  }

  cdpEndpoint() {
    return `${this._wsHost}${this._cdpPath}`;
  }

  extensionEndpoint() {
    return `${this._wsHost}${this._extensionPath}`;
  }

  // The only piece of relay-selection logic exposed to callers: whether the
  // relay speaks the raw Playwright channel protocol (v3) instead of CDP, so
  // extensionContextFactory knows to use `connect()` instead of
  // `connectOverCDP()`.
  get usesChannelProtocol(): boolean {
    return this._protocolVersion === protocol.CHANNEL_VERSION;
  }

  async establishExtensionConnection(clientName: string) {
    debugLogger('Establishing extension connection');
    await this._openConnectPageInBrowser(clientName);
    debugLogger('Waiting for incoming extension connection');
    await this._extensionConnectionPromise;
    if (this.usesChannelProtocol)
      await this._extensionReadyPromise;
    else
      await this._handler.ready();
    debugLogger('Extension connection established');
  }

  private async _openConnectPageInBrowser(clientName: string) {
    const mcpRelayEndpoint = `${this._wsHost}${this._extensionPath}`;
    const url = new URL(`chrome-extension://${playwrightExtensionId}/connect.html`);
    url.searchParams.set('mcpRelayUrl', mcpRelayEndpoint);
    const client = {
      name: clientName,
      // Not used anymore.
      version: undefined,
    };
    url.searchParams.set('client', JSON.stringify(client));
    url.searchParams.set('protocolVersion', this._protocolVersion.toString());
    const token = process.env.PLAYWRIGHT_MCP_EXTENSION_TOKEN;
    if (token)
      url.searchParams.set('token', token);
    const href = url.toString();

    const channel = registry.isChromiumAlias(this._browserChannel) ? 'chromium' : this._browserChannel;
    let executablePath = this._executablePath;
    if (!executablePath) {
      const executableInfo = registry.findExecutable(channel);
      if (!executableInfo)
        throw new Error(`Unsupported channel: "${this._browserChannel}"`);
      executablePath = executableInfo.executablePath();
      if (!executablePath)
        throw new Error(`"${this._browserChannel}" executable not found. Make sure it is installed at a standard location.`);
    }

    const args: string[] = [];
    // The default profile dir is not passed explicitly, the browser resolves it on its own.
    if (this._customUserDataDir)
      args.push(`--user-data-dir=${this._customUserDataDir}`);
    if (this._profileDirectory)
      args.push(`--profile-directory=${this._profileDirectory}`);
    if (os.platform() === 'linux' && channel === 'chromium')
      args.push('--no-sandbox');
    args.push(href);
    spawn(executablePath, args, {
      windowsHide: true,
      detached: true,
      shell: false,
      stdio: 'ignore',
    });
  }

  stop(): void {
    this._closeConnections('Server stopped');
    void this._wsServer.close().catch(logUnhandledError);
  }

  private _closeConnections(reason: string) {
    this._closeCDPConnection(reason);
    this._closeExtensionConnection(reason);
  }

  private _handlePlaywrightConnection(ws: WebSocket): void {
    if (!this._extensionConnection && !this._extensionSocket) {
      debugLogger('Rejecting Playwright connection: extension not connected');
      ws.close(1000, 'Extension not connected');
      return;
    }
    if (this._cdpConnection) {
      debugLogger('Rejecting second Playwright connection');
      ws.close(1000, 'Another CDP client already connected');
      return;
    }
    this._cdpConnection = ws;
    if (this.usesChannelProtocol) {
      // v3: forward Playwright channel frames to the extension unchanged.
      ws.on('message', data => this._forwardToExtension(data));
    } else {
      this._handler.connectOverCDP(msg => this._sendToCDPClient(msg));
      ws.on('message', async data => {
        try {
          await this._handlePlaywrightMessage(JSON.parse(data.toString()));
        } catch (error: any) {
          debugLogger(`Error while handling Playwright message\n${data.toString()}\n`, error);
        }
      });
    }
    ws.on('close', () => {
      this._closeExtensionConnection('Playwright client disconnected');
      debugLogger('Playwright WebSocket closed');
    });
    ws.on('error', error => {
      debugLogger('Playwright WebSocket error:', error);
    });
    debugLogger('Playwright MCP connected');
  }

  private _closeExtensionConnection(reason: string) {
    this._extensionConnection?.close(reason);
    if (this._extensionSocket?.readyState === ws.OPEN)
      this._extensionSocket.close(1000, reason);
    if (!this._extensionConnectionPromise.isDone())
      this._extensionConnectionPromise.reject(new Error(reason));
    if (!this._extensionReadyPromise.isDone())
      this._extensionReadyPromise.reject(new Error(reason));
  }

  private _closeCDPConnection(reason: string) {
    if (this._cdpConnection?.readyState === ws.OPEN)
      this._cdpConnection.close(1000, reason);
  }

  private _handleExtensionConnection(ws: WebSocket): void {
    if (this._extensionConnection || this._extensionSocket) {
      ws.close(1000, 'Another extension connection already established');
      return;
    }
    if (this.usesChannelProtocol) {
      this._handleExtensionConnectionChannel(ws);
      return;
    }
    this._extensionConnection = new ExtensionConnection(ws);
    this._extensionConnection.onclose = reason => {
      debugLogger('Extension WebSocket closed:', reason);
      this._handler.onExtensionDisconnect(reason);
      this._closeCDPConnection(`Extension disconnected: ${reason}`);
    };
    this._extensionConnection.onmessage = (method, params) => this._handler.handleExtensionEvent(method, params);
    this._extensionConnectionPromise.resolve();
  }

  // v3: the extension connection is a raw pass-through pipe. It interprets
  // two things itself — the initial 'extension.ready' control frame and
  // periodic 'extension.ping' keepalives — and forwards everything else to
  // the Playwright client unchanged. Both are handled synchronously inside
  // the 'message' handler so normal frame ordering is preserved.
  private _handleExtensionConnectionChannel(ws: WebSocket): void {
    this._extensionSocket = ws;
    ws.on('message', data => {
      const text = data.toString();
      if (this._consumeExtensionKeepalive(text))
        return;
      if (!this._extensionReadyPromise.isDone())
        this._handleExtensionControlMessage(text);
      else
        this._forwardToPlaywrightClient(text);
    });
    ws.on('close', (code, reason) => {
      const reasonText = reason.toString();
      debugLogger('Extension WebSocket closed:', reasonText);
      this._extensionSocket = null;
      if (!this._extensionReadyPromise.isDone())
        this._extensionReadyPromise.reject(new Error(`Extension disconnected before it was ready: ${reasonText}`));
      this._closeCDPConnection(`Extension disconnected: ${reasonText}`);
    });
    ws.on('error', error => {
      debugLogger('Extension WebSocket error:', error);
    });
    this._extensionConnectionPromise.resolve();
  }

  // Consumes an 'extension.ping' application keepalive and replies with
  // 'extension.pong' on the same socket, returning true. Returns false for
  // anything else (including malformed JSON), leaving it to be handled by
  // the caller as a control message or forwarded as a normal channel frame.
  private _consumeExtensionKeepalive(text: string): boolean {
    if (text.length > 64 || !text.includes('extension.ping'))
      return false;
    let message: any;
    try {
      message = JSON.parse(text);
    } catch {
      return false;
    }
    if (message?.method !== 'extension.ping')
      return false;
    const pong: ExtensionPongMessage = { method: 'extension.pong' };
    this._extensionSocket?.send(JSON.stringify(pong));
    return true;
  }

  private _handleExtensionControlMessage(text: string): void {
    let message: ExtensionReadyMessage;
    try {
      message = JSON.parse(text);
    } catch (e: any) {
      this._failExtensionReadiness(`Malformed extension control message: ${text}`);
      return;
    }
    if (message?.method !== 'extension.ready') {
      this._failExtensionReadiness(`Expected 'extension.ready' control message, got: ${text}`);
      return;
    }
    const mismatch = this._playwrightVersionMismatch(message.params?.playwrightVersion);
    if (mismatch) {
      this._failExtensionReadiness(mismatch);
      return;
    }
    debugLogger('Extension ready:', text);
    this._extensionReadyPromise.resolve();
  }

  private _failExtensionReadiness(message: string): void {
    debugLogger(message);
    this._extensionReadyPromise.reject(new Error(message));
    this._extensionSocket?.close(1000, message);
  }

  private _playwrightVersionMismatch(advertised: string | undefined): string | undefined {
    if (!advertised)
      return 'Extension did not advertise a Playwright version in its \'extension.ready\' control message';
    const expected = getPlaywrightVersion(true);
    const received = advertised.split('.').slice(0, 2).join('.');
    if (received !== expected)
      return `Playwright version mismatch: extension is v${advertised}, expected v${expected}.x`;
    return undefined;
  }

  private _forwardToPlaywrightClient(data: string): void {
    if (!this._cdpConnection) {
      debugLogger('Dropping extension message: no Playwright client connected', data);
      return;
    }
    this._cdpConnection.send(data);
  }

  private _forwardToExtension(data: websocket.RawData): void {
    if (!this._extensionSocket) {
      debugLogger('Dropping Playwright message: no extension connected', data.toString());
      return;
    }
    this._extensionSocket.send(data.toString());
  }

  private async _handlePlaywrightMessage(message: CDPCommand): Promise<void> {
    debugLogger('← Playwright:', `${message.method} (id=${message.id})`);
    const { id, sessionId, method, params } = message;
    try {
      const result = await this._handleCDPCommand(method, params, sessionId);
      this._sendToCDPClient({ id, sessionId, result });
    } catch (e) {
      debugLogger('Error in the extension:', e);
      this._sendToCDPClient({
        id,
        sessionId,
        error: { message: (e as Error).message }
      });
    }
  }

  private async _handleCDPCommand(method: string, params: any, sessionId: string | undefined): Promise<any> {
    switch (method) {
      case 'Browser.getVersion': {
        return {
          protocolVersion: '1.3',
          product: 'Chrome/Extension-Bridge',
          userAgent: 'CDP-Bridge-Server/1.0.0',
        };
      }
      case 'Browser.setDownloadBehavior': {
        return { };
      }
    }
    const handled = await this._handler.handleCDPCommand(method, params, sessionId);
    if (handled)
      return handled.result;
    return await this._handler.forwardToExtension(method, params, sessionId);
  }

  private _sendToCDPClient(message: CDPResponse): void {
    debugLogger('→ Playwright:', `${message.method ?? `response(id=${message.id})`}`);
    this._cdpConnection?.send(JSON.stringify(message));
  }
}

type ExtensionResponse = {
  id?: number;
  method?: string;
  params?: any;
  result?: any;
  error?: string;
};

class ExtensionConnection {
  private readonly _ws: WebSocket;
  private readonly _callbacks = new Map<number, { resolve: (o: any) => void, reject: (e: Error) => void, error: Error }>();
  private _lastId = 0;

  onmessage?: <M extends keyof ExtensionEventsV2>(method: M, params: ExtensionEventsV2[M]['params']) => void;
  onclose?: (reason: string) => void;

  constructor(ws: WebSocket) {
    this._ws = ws;
    this._ws.on('message', this._onMessage.bind(this));
    this._ws.on('close', this._onClose.bind(this));
    this._ws.on('error', this._onError.bind(this));
  }

  async send<M extends keyof ExtensionCommandV2>(method: M, params: ExtensionCommandV2[M]['params']): Promise<any> {
    if (this._ws.readyState !== ws.OPEN)
      throw new Error(`Unexpected WebSocket state: ${this._ws.readyState}`);
    const id = ++this._lastId;
    this._ws.send(JSON.stringify({ id, method, params }));
    const error = new Error(`Protocol error: ${method}`);
    return new Promise((resolve, reject) => {
      this._callbacks.set(id, { resolve, reject, error });
    });
  }

  close(message: string) {
    debugLogger('closing extension connection:', message);
    if (this._ws.readyState === ws.OPEN)
      this._ws.close(1000, message);
  }

  private _onMessage(event: websocket.RawData) {
    const eventData = event.toString();
    let parsedJson;
    try {
      parsedJson = JSON.parse(eventData);
    } catch (e: any) {
      debugLogger(`<closing ws> Closing websocket due to malformed JSON. eventData=${eventData} e=${e?.message}`);
      this._ws.close();
      return;
    }
    try {
      this._handleParsedMessage(parsedJson);
    } catch (e: any) {
      debugLogger(`<closing ws> Closing websocket due to failed onmessage callback. eventData=${eventData} e=${e?.message}`);
      this._ws.close();
    }
  }

  private _handleParsedMessage(object: ExtensionResponse) {
    if (object.id && this._callbacks.has(object.id)) {
      const callback = this._callbacks.get(object.id)!;
      this._callbacks.delete(object.id);
      if (object.error) {
        const error = callback.error;
        error.message = object.error;
        callback.reject(error);
      } else {
        callback.resolve(object.result);
      }
    } else if (object.id) {
      debugLogger('← Extension: unexpected response', object);
    } else {
      this.onmessage?.(object.method! as keyof ExtensionEventsV2, object.params);
    }
  }

  private _onClose(event: websocket.CloseEvent) {
    debugLogger(`<ws closed> code=${event.code} reason=${event.reason}`);
    this._dispose();
    this.onclose?.(event.reason);
  }

  private _onError(event: websocket.ErrorEvent) {
    debugLogger(`<ws error> message=${event.message} type=${event.type} target=${event.target}`);
    this._dispose();
  }

  private _dispose() {
    for (const callback of this._callbacks.values())
      callback.reject(new Error('WebSocket closed'));
    this._callbacks.clear();
  }
}
