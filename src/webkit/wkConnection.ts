/**
 * Copyright 2017 Google Inc. All rights reserved.
 * Modifications copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { EventEmitter } from 'events';
import { assert } from '../helper';
import { ConnectionTransport, ProtocolRequest, ProtocolResponse, protocolLog } from '../transport';
import { Protocol } from './protocol';
import { InnerLogger } from '../logger';

// WKPlaywright uses this special id to issue Browser.close command which we
// should ignore.
export const kBrowserCloseMessageId = -9999;

// We emulate kPageProxyMessageReceived message to unify it with Browser.pageProxyCreated
// and Browser.pageProxyDestroyed for easier management.
export const kPageProxyMessageReceived = 'kPageProxyMessageReceived';
export type PageProxyMessageReceivedPayload = { pageProxyId: string, message: any };

export class WKConnection {
  private readonly _transport: ConnectionTransport;
  private readonly _onDisconnect: () => void;
  private _lastId = 0;
  private _closed = false;

  readonly browserSession: WKSession;
  private _logger: InnerLogger;

  constructor(transport: ConnectionTransport, logger: InnerLogger, onDisconnect: () => void) {
    this._transport = transport;
    this._logger = logger;
    this._transport.onmessage = this._dispatchMessage.bind(this);
    this._transport.onclose = this._onClose.bind(this);
    this._onDisconnect = onDisconnect;
    this.browserSession = new WKSession(this, '', 'Browser has been closed.', (message: any) => {
      this.rawSend(message);
    });
  }

  nextMessageId(): number {
    return ++this._lastId;
  }

  rawSend(message: ProtocolRequest) {
    if (this._logger._isLogEnabled(protocolLog))
      this._logger._log(protocolLog, 'SEND ► ' + rewriteInjectedScriptEvaluationLog(message));
    this._transport.send(message);
  }

  private _dispatchMessage(message: ProtocolResponse) {
    if (this._logger._isLogEnabled(protocolLog))
      this._logger._log(protocolLog, '◀ RECV ' + rewriteScreencastFrameLog(message));
    if (message.id === kBrowserCloseMessageId)
      return;
    if (message.pageProxyId) {
      const payload: PageProxyMessageReceivedPayload = { message: message, pageProxyId: message.pageProxyId };
      this.browserSession.dispatchMessage({ method: kPageProxyMessageReceived, params: payload });
      return;
    }
    this.browserSession.dispatchMessage(message);
  }

  _onClose() {
    this._closed = true;
    this._transport.onmessage = undefined;
    this._transport.onclose = undefined;
    this.browserSession.dispose();
    this._onDisconnect();
  }

  isClosed() {
    return this._closed;
  }

  close() {
    if (!this._closed)
      this._transport.close();
  }
}

export class WKSession extends EventEmitter {
  connection: WKConnection;
  errorText: string;
  readonly sessionId: string;

  private _disposed = false;
  private readonly _rawSend: (message: any) => void;
  private readonly _callbacks = new Map<number, {resolve: (o: any) => void, reject: (e: Error) => void, error: Error, method: string}>();
  private _crashed: boolean = false;

  on: <T extends keyof Protocol.Events | symbol>(event: T, listener: (payload: T extends symbol ? any : Protocol.Events[T extends keyof Protocol.Events ? T : never]) => void) => this;
  addListener: <T extends keyof Protocol.Events | symbol>(event: T, listener: (payload: T extends symbol ? any : Protocol.Events[T extends keyof Protocol.Events ? T : never]) => void) => this;
  off: <T extends keyof Protocol.Events | symbol>(event: T, listener: (payload: T extends symbol ? any : Protocol.Events[T extends keyof Protocol.Events ? T : never]) => void) => this;
  removeListener: <T extends keyof Protocol.Events | symbol>(event: T, listener: (payload: T extends symbol ? any : Protocol.Events[T extends keyof Protocol.Events ? T : never]) => void) => this;
  once: <T extends keyof Protocol.Events | symbol>(event: T, listener: (payload: T extends symbol ? any : Protocol.Events[T extends keyof Protocol.Events ? T : never]) => void) => this;

  constructor(connection: WKConnection, sessionId: string, errorText: string, rawSend: (message: any) => void) {
    super();
    this.connection = connection;
    this.sessionId = sessionId;
    this._rawSend = rawSend;
    this.errorText = errorText;

    this.on = super.on;
    this.off = super.removeListener;
    this.addListener = super.addListener;
    this.removeListener = super.removeListener;
    this.once = super.once;
  }

  async send<T extends keyof Protocol.CommandParameters>(
    method: T,
    params?: Protocol.CommandParameters[T]
  ): Promise<Protocol.CommandReturnValues[T]> {
    if (this._crashed)
      throw new Error('Target crashed');
    if (this._disposed)
      throw new Error(`Protocol error (${method}): ${this.errorText}`);
    const id = this.connection.nextMessageId();
    const messageObj = { id, method, params };
    this._rawSend(messageObj);
    return new Promise<Protocol.CommandReturnValues[T]>((resolve, reject) => {
      this._callbacks.set(id, {resolve, reject, error: new Error(), method});
    });
  }

  markAsCrashed() {
    this._crashed = true;
  }

  isDisposed(): boolean {
    return this._disposed;
  }

  dispose() {
    for (const callback of this._callbacks.values())
      callback.reject(rewriteError(callback.error, `Protocol error (${callback.method}): ${this.errorText}`));
    this._callbacks.clear();
    this._disposed = true;
  }

  dispatchMessage(object: any) {
    if (object.id && this._callbacks.has(object.id)) {
      const callback = this._callbacks.get(object.id)!;
      this._callbacks.delete(object.id);
      if (object.error)
        callback.reject(createProtocolError(callback.error, callback.method, object.error));
      else
        callback.resolve(object.result);
    } else if (object.id) {
      // Response might come after session has been disposed and rejected all callbacks.
      assert(this.isDisposed());
    } else {
      Promise.resolve().then(() => this.emit(object.method, object.params));
    }
  }
}

export function createProtocolError(error: Error, method: string, protocolError: { message: string; data: any; }): Error {
  let message = `Protocol error (${method}): ${protocolError.message}`;
  if ('data' in protocolError)
    message += ` ${JSON.stringify(protocolError.data)}`;
  return rewriteError(error, message);
}

export function rewriteError(error: Error, message: string): Error {
  error.message = message;
  return error;
}

export function isSwappedOutError(e: Error) {
  return e.message.includes('Target was swapped out.');
}

function rewriteInjectedScriptEvaluationLog(message: any): string {
  // Injected script is very long and clutters protocol logs.
  // To increase development velocity, we skip replace it with short description in the log.
  if (message.params && message.params.message && message.params.message.includes('Runtime.evaluate') && message.params.message.includes('src/injected/injected.ts'))
    return `{"id":${message.id},"method":"${message.method}","params":{"message":[evaluate injected script],"targetId":"${message.params.targetId}"},"pageProxyId":${message.pageProxyId}}`;
  return JSON.stringify(message);
}

function rewriteScreencastFrameLog(message: any): string {
  // Screencast frames are long base64 strings cluttering logs. To increase development
  // velocity, we skip replace it with short description in the log.
  if (message.method === 'Screencast.frame') {
    return JSON.stringify(message, (key, value) => {
      if (key === 'data')
        return `[data len=${value.length}]`;
      return value;
    });
  }
  return JSON.stringify(message);
}
