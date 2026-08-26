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
  throw new Error('Network socket operations are not supported by the Playwright extension server');
}

export class Socket extends EventEmitter {
}

export class Server extends EventEmitter {
}

export const createServer = notSupported;
export const createConnection = notSupported;
export const connect = notSupported;
export const isIP = (value: string) => value.includes(':') ? 6 : /^\d+\.\d+\.\d+\.\d+$/.test(value) ? 4 : 0;
export const isIPv4 = (value: string) => isIP(value) === 4;
export const isIPv6 = (value: string) => isIP(value) === 6;
export const getDefaultAutoSelectFamily = () => false;
export const getDefaultAutoSelectFamilyAttemptTimeout = () => 250;
export const setDefaultAutoSelectFamily = () => {};
export const setDefaultAutoSelectFamilyAttemptTimeout = () => {};

export default {
  Socket,
  Server,
  createServer,
  createConnection,
  connect,
  isIP,
  isIPv4,
  isIPv6,
  getDefaultAutoSelectFamily,
  getDefaultAutoSelectFamilyAttemptTimeout,
  setDefaultAutoSelectFamily,
  setDefaultAutoSelectFamilyAttemptTimeout,
};
