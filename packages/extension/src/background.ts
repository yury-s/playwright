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

import './nodeStubs/processShim';
import './nodeStubs/buffer';

import { debugLog } from './relayConnection';
import { PendingConnections } from './pendingConnection';
import { RelayConnection } from './relayConnection';
import { ConnectedTabGroup, cleanupStalePlaywrightGroups, isNonDebuggableUrl, ungroupTabs, uniqueGroupStyle } from './connectedTabGroup';
import { ExtensionPlaywrightServer } from './playwrightServer';

import playwrightPackage from '../../playwright-core/package.json';

import type { TabConnection } from './connectedTabGroup';

const PLAYWRIGHT_PROTOCOL_VERSION = 3;
const SHARED_GROUP_STYLE = { title: 'Playwright', color: 'green' } as const;

type PageMessage = {
  type: 'connectionRequested';
  mcpRelayUrl: string;
  protocolVersion: number;
} | {
  type: 'getTabs';
} | {
  type: 'connectToTab';
  // Picked in the connect page; absent on the token-bypass path where no tab
  // selection happens.
  tab?: chrome.tabs.Tab;
  clientName?: string;
} | {
  type: 'getConnectionStatus';
} | {
  type: 'disconnect';
  connectionId: number;
} | {
  type: 'keepalive';
};

type ActiveConnection = {
  shared?: boolean;
  clientName: string | undefined;
  connectedTabIds(): number[];
  close(reason: string): void;
  releaseTab(tabId: number): void;
  groupStyle: { title: string; color: `${chrome.tabGroups.Color}` };
};

class SharedServerConnection implements TabConnection {
  private _operation = Promise.resolve();
  private _readyOperation = Promise.resolve();
  private _closed = false;

  onclose?: () => void;
  ontabattached?: (tabId: number) => void;
  ontabdetached?: (tabId: number) => void;

  constructor(private _server: ExtensionPlaywrightServer) {
    this._server.ontabattached = tabId => {
      this.ontabattached?.(tabId);
    };
    this._server.ontabdetached = tabId => {
      this.ontabdetached?.(tabId);
    };
    this._server.onstatechange = () => this._maybeCloseIfEmpty();
  }

  get attachedTabs(): ReadonlySet<number> {
    return this._server.attachedTabs;
  }

  attachTab(tab: chrome.tabs.Tab): void {
    this._readyOperation = this._operation.then(() => this._server.addTab(tab));
    this._operation = this._readyOperation.catch(error => {
      debugLog(`Failed to attach tab ${tab.id}:`, error);
    });
  }

  detachTab(tabId: number): void {
    this._server.removeTab(tabId);
  }

  didInitialize(): void {
  }

  close(reason: string): void {
    if (this._closed)
      return;
    this._closed = true;
    this._server.close(reason);
    this.onclose?.();
  }

  async ready(): Promise<void> {
    await this._readyOperation;
  }

  private _maybeCloseIfEmpty(): void {
    if (!this._server.attachedTabs.size && !this._server.hasPendingReattach)
      this.close('All controlled tabs detached');
  }
}

class PlaywrightExtension {
  private _connections = new Map<number, ActiveConnection>();
  private _lastConnectionId = 0;
  private _pendingConnections = new PendingConnections();
  private _sharedServer: ExtensionPlaywrightServer | undefined;
  private _sharedServerConnection: SharedServerConnection | undefined;
  private _sharedTabGroup: ConnectedTabGroup | undefined;
  // Service worker restarts lose all connection state, so any existing
  // Playwright groups are stale. Connections wait on this before reconciling.
  private _cleanupPromise: Promise<void>;

  constructor() {
    chrome.runtime.onMessage.addListener(this._onMessage.bind(this));
    chrome.action.onClicked.addListener(this._onActionClicked.bind(this));
    this._cleanupPromise = cleanupStalePlaywrightGroups();
  }

  // Promise-based message handling is not supported in Chrome: https://issues.chromium.org/issues/40753031
  private _onMessage(message: PageMessage, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) {
    switch (message.type) {
      case 'connectionRequested': {
        const selectorTabId = sender.tab!.id!;
        this._releaseConnectPage(selectorTabId).then(() => {
          this._pendingConnections.create(selectorTabId, message.mcpRelayUrl, message.protocolVersion);
          sendResponse({ success: true });
        });
        return true;
      }
      case 'getTabs':
        this._getTabs(sender.tab?.id).then(
            tabs => sendResponse({ success: true, tabs, currentTabId: sender.tab?.id }),
            (error: any) => sendResponse({ success: false, error: error.message }));
        return true;
      case 'connectToTab': {
        // Token-bypass (no specific pick) falls back to the connect page itself
        // so `ConnectedTabGroup` always has a concrete tab to start from. Both
        // sender.tab and UI-supplied tabs come from chrome.tabs.query / runtime
        // message sender, where `id` is always defined.
        const selectedTab = (message.tab ?? sender.tab!) as chrome.tabs.Tab & { id: number };
        this._connectTab(sender.tab!.id!, selectedTab, message.clientName).then(
            () => sendResponse({ success: true }),
            (error: any) => sendResponse({ success: false, error: error.message }));
        return true; // Return true to indicate that the response will be sent asynchronously
      }
      case 'getConnectionStatus':
        sendResponse({
          connections: [...this._connections].map(([id, group]) => ({
            id,
            clientName: group.clientName,
            connectedTabIds: group.connectedTabIds(),
          })),
        });
        return false;
      case 'disconnect':
        this._connections.get(message.connectionId)?.close('User disconnected');
        sendResponse({ success: true });
        return false;
      case 'keepalive':
        // Connect page pings us every ~20s so receiving this message resets
        // the MV3 service worker idle timer and keeps the relay WebSocket alive.
        return false;
    }
  }

  private async _connectTab(selectorTabId: number, tab: chrome.tabs.Tab & { id: number }, clientName: string | undefined): Promise<void> {
    try {
      await this._cleanupPromise;
      this._releaseTab(selectorTabId);
      if (tab.id !== selectorTabId && this._connectedTabIds().has(tab.id))
        throw new Error('This tab is already connected to another client');

      const pendingConnection = await this._pendingConnections.take(selectorTabId);
      if (!pendingConnection)
        throw new Error('Pending client connection closed');

      if (pendingConnection.protocolVersion === PLAYWRIGHT_PROTOCOL_VERSION)
        await this._connectPlaywrightClient(pendingConnection.socket, tab, clientName);
      else
        this._connectCDPClient(pendingConnection.socket, tab, clientName);

      await Promise.all([
        chrome.tabs.update(tab.id, { active: true }),
        chrome.windows.update(tab.windowId, { focused: true }),
      ]).catch(() => {});

      if (tab.id !== selectorTabId)
        await chrome.tabs.remove(selectorTabId).catch(() => {});
    } catch (error: any) {
      debugLog(`Failed to connect tab ${tab.id}:`, error.message);
      throw error;
    }
  }

  private _connectCDPClient(socket: WebSocket, tab: chrome.tabs.Tab & { id: number }, clientName: string | undefined): void {
    const id = ++this._lastConnectionId;
    const connection = new RelayConnection(socket);
    const taken = [...this._connections.values()].map(group => group.groupStyle);
    const group = new ConnectedTabGroup(connection, tab, clientName, uniqueGroupStyle(clientName, taken), tabId => this._pendingConnections.has(tabId));
    group.onclose = () => this._connections.delete(id);
    this._connections.set(id, group);
  }

  private async _connectPlaywrightClient(socket: WebSocket, tab: chrome.tabs.Tab & { id: number }, clientName: string | undefined): Promise<void> {
    if (!this._sharedServer) {
      this._sharedServer = new ExtensionPlaywrightServer();
      this._sharedServerConnection = new SharedServerConnection(this._sharedServer);
      this._sharedTabGroup = new ConnectedTabGroup(
          this._sharedServerConnection,
          tab,
          undefined,
          SHARED_GROUP_STYLE,
          tabId => this._pendingConnections.has(tabId));
      this._sharedTabGroup.onclose = () => {
        this._sharedTabGroup = undefined;
        this._sharedServerConnection = undefined;
        this._sharedServer = undefined;
      };
      this._sharedServer.onempty = () => this._sharedServerConnection?.close('Last Playwright client disconnected');
    } else {
      this._sharedTabGroup!.addTab(tab);
    }
    const server = this._sharedServer;
    const serverConnection = this._sharedServerConnection!;
    let id: number | undefined;
    let keepalive: ReturnType<typeof setInterval> | undefined;
    try {
      await serverConnection.ready();
      if (this._sharedServer !== server || this._sharedServerConnection !== serverConnection)
        throw new Error('Playwright extension server closed while accepting the connection');

      id = ++this._lastConnectionId;
      keepalive = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN)
          socket.send(JSON.stringify({ method: 'extension.ping' }));
      }, 20_000);
      const connection: ActiveConnection = {
        shared: true,
        clientName,
        connectedTabIds: () => this._sharedTabGroup?.connectedTabIds() ?? [],
        close: reason => socket.close(1000, reason),
        releaseTab: tabId => this._sharedTabGroup?.releaseTab(tabId),
        groupStyle: SHARED_GROUP_STYLE,
      };
      this._connections.set(id, connection);
      server.accept(socket, () => {
        if (keepalive !== undefined)
          clearInterval(keepalive);
        this._connections.delete(id!);
      });
      socket.send(JSON.stringify({
        method: 'extension.ready',
        params: { playwrightVersion: playwrightPackage.version },
      }));
    } catch (error) {
      if (keepalive !== undefined)
        clearInterval(keepalive);
      if (id !== undefined)
        this._connections.delete(id);
      if (socket.readyState === WebSocket.OPEN)
        socket.close(1011, error instanceof Error ? error.message : String(error));
      if (![...this._connections.values()].some(connection => connection.shared) && this._sharedServerConnection === serverConnection)
        serverConnection.close('Failed to initialize Playwright extension server');
      throw error;
    }
  }

  // Chrome may create the connect page inside the active client's group.
  private async _releaseConnectPage(tabId: number): Promise<void> {
    this._releaseTab(tabId);
    await ungroupTabs([tabId]);
  }

  private _releaseTab(tabId: number): void {
    for (const group of this._connections.values())
      group.releaseTab(tabId);
  }

  private async _getTabs(selectorTabId: number | undefined): Promise<chrome.tabs.Tab[]> {
    const tabs = await chrome.tabs.query({});
    const connectedTabIds = this._connectedTabIds();
    return tabs.filter(tab => !isNonDebuggableUrl(tab.url) && (tab.id === selectorTabId || !connectedTabIds.has(tab.id!)));
  }

  private _connectedTabIds(): Set<number> {
    return new Set([...this._connections.values()].flatMap(group => group.connectedTabIds()));
  }

  private async _onActionClicked(): Promise<void> {
    await chrome.tabs.create({
      url: chrome.runtime.getURL('status.html'),
      active: true
    });
  }
}

new PlaywrightExtension();
