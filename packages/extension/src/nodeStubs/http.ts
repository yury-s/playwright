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

import { EventEmitter } from './events';

function notSupported(): never {
  throw new Error('HTTP server operations are not supported by the Playwright extension server');
}

export class Agent extends EventEmitter {
}

export class ClientRequest extends EventEmitter {
}

export class IncomingMessage extends EventEmitter {
}

export class Server extends EventEmitter {
}

export const request = notSupported;
export const get = notSupported;
export const createServer = notSupported;
export const validateHeaderName = () => {};
export const validateHeaderValue = () => {};
export const METHODS: string[] = [];
export const STATUS_CODES: Record<number, string> = {};
export const globalAgent = new Agent();

export default {
  Agent,
  ClientRequest,
  IncomingMessage,
  Server,
  request,
  get,
  createServer,
  validateHeaderName,
  validateHeaderValue,
  METHODS,
  STATUS_CODES,
  globalAgent,
};
