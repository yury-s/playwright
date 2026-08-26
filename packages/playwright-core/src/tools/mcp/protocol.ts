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

// The protocol version defined in this file. Bumped whenever the
// commands/events change. Sent to the extension, which rejects clients
// requesting a version it does not support.
export const VERSION = 2;

// Alternate relay strategy, opted into via PLAYWRIGHT_EXTENSION_PROTOCOL=3.
// Instead of translating between the chrome.* dialect and CDP, the relay
// forwards Playwright's own client<->server wire protocol frames unchanged
// between the two WebSocket endpoints.
export const CHANNEL_VERSION = 3;

// Control-plane message sent by the extension immediately after it connects
// under the channel protocol (v3), before the Playwright client connects.
// Carries the extension's Playwright version so the relay can validate
// compatibility before unblocking `establishExtensionConnection`. Consumed
// by the relay and never forwarded to the Playwright client.
export type ExtensionReadyMessage = {
  method: 'extension.ready';
  params: { playwrightVersion: string };
};

// Application keepalive exchanged over the extension socket under the
// channel protocol (v3). The extension periodically sends 'extension.ping';
// the relay replies with 'extension.pong' on the same socket. Neither is
// forwarded to the Playwright client, and both are ignored for the purposes
// of ordering normal Playwright channel frames.
export type ExtensionPingMessage = {
  method: 'extension.ping';
};
export type ExtensionPongMessage = {
  method: 'extension.pong';
};

// Structural mirrors of @types/chrome shapes used over the wire. The extension
// imports the real chrome.* types and they are structurally compatible.
export type Debuggee = { tabId?: number; extensionId?: string; targetId?: string };
export type DebuggerSession = Debuggee & { sessionId?: string };
export type TabCreateProperties = {
  active?: boolean;
  index?: number;
  openerTabId?: number;
  pinned?: boolean;
  url?: string;
  windowId?: number;
};
export type Tab = {
  id?: number;
  index: number;
  windowId: number;
  openerTabId?: number;
  url?: string;
  title?: string;
  active: boolean;
  pinned: boolean;
};
export type TabRemoveInfo = { windowId: number; isWindowClosing: boolean };

// Protocol v2: command params/results mirror chrome.* positional arguments,
// so the extension can spread them straight into chrome.<api>.<method>(...).
export type ExtensionCommandV2 = {
  // chrome.debugger.attach(target, requiredVersion)
  'chrome.debugger.attach': {
    params: [target: Debuggee, requiredVersion: string];
    result: void;
  };
  // chrome.debugger.detach(target)
  'chrome.debugger.detach': {
    params: [target: Debuggee];
    result: void;
  };
  // chrome.debugger.sendCommand(target, method, commandParams?)
  'chrome.debugger.sendCommand': {
    params: [target: DebuggerSession, method: string, commandParams?: object];
    result: any;
  };
  // chrome.tabs.create(createProperties)
  'chrome.tabs.create': {
    params: [createProperties: TabCreateProperties];
    result: Tab;
  };
  // chrome.tabs.remove(tabIds)
  'chrome.tabs.remove': {
    params: [tabIds: number | number[]];
    result: void;
  };
};

// Protocol v2 events mirror chrome.<api>.<event>.addListener callback signatures.
export type ExtensionEventsV2 = {
  // chrome.debugger.onEvent: (source, method, params?) => void
  'chrome.debugger.onEvent': {
    params: [source: DebuggerSession, method: string, eventParams?: object];
  };
  // chrome.debugger.onDetach: (source, reason) => void
  'chrome.debugger.onDetach': {
    params: [source: Debuggee, reason: string];
  };
  // chrome.tabs.onCreated: (tab) => void
  'chrome.tabs.onCreated': {
    params: [tab: Tab];
  };
  // chrome.tabs.onRemoved: (tabId, removeInfo) => void
  'chrome.tabs.onRemoved': {
    params: [tabId: number, removeInfo: TabRemoveInfo];
  };
  // Playwright-specific: signals end of the initial tab handshake. The relay
  // withholds Playwright-side CDP messages until this event arrives, so that
  // `Target.setAutoAttach` can be answered from a fully-populated tab model
  // rather than blocking on a user pick.
  'extension.initialized': {
    params: [];
  };
};
