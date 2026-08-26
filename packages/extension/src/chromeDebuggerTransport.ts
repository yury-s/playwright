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

import { debugLog } from './relayConnection';

import type { ConnectionTransport, ProtocolRequest, ProtocolResponse } from '../../playwright-core/src/server/transport';

const REATTACH_DELAY_MS = 150;
const REATTACH_VERIFY_MS = 2500;
const REATTACH_COOLDOWN_MS = 3000;

type TabSession = {
  tabId: number;
  sessionId: string;
  targetInfo: any;
  childSessions: Set<string>;
};

export class ChromeDebuggerTransport implements ConnectionTransport {
  private _knownTabs = new Map<number, chrome.tabs.Tab>();
  private _tabSessions = new Map<number, TabSession>();
  private _autoAttach = false;
  private _nextSessionId = 1;
  private _closed = false;
  private _pendingReattach = new Set<number>();
  private _recentReattach = new Set<number>();

  onmessage?: (message: ProtocolResponse) => void;
  onclose?: (reason?: string) => void;
  ontabattached?: (tabId: number) => void;
  ontabdetached?: (tabId: number) => void;
  onstatechange?: () => void;

  constructor() {
    chrome.debugger.onEvent.addListener(this._onDebuggerEvent);
    chrome.debugger.onDetach.addListener(this._onDebuggerDetach);
    chrome.tabs.onCreated.addListener(this._onTabCreated);
    chrome.tabs.onRemoved.addListener(this._onTabRemoved);
  }

  get attachedTabs(): ReadonlySet<number> {
    return new Set(this._tabSessions.keys());
  }

  get hasPendingReattach(): boolean {
    return !!this._pendingReattach.size;
  }

  async addTab(tab: chrome.tabs.Tab): Promise<void> {
    if (this._closed || tab.id === undefined)
      return;
    this._knownTabs.set(tab.id, tab);
    if (this._autoAttach)
      await this._attachTab(tab.id);
  }

  removeTab(tabId: number): void {
    if (this._closed || !this._knownTabs.has(tabId))
      return;
    this._knownTabs.delete(tabId);
    this._pendingReattach.delete(tabId);
    if (!this._tabSessions.has(tabId)) {
      this.onstatechange?.();
      return;
    }
    chrome.debugger.detach({ tabId }).catch(error => debugLog(`Failed to detach tab ${tabId}:`, error));
    this._detachTab(tabId);
  }

  send(message: ProtocolRequest): void {
    void this._send(message);
  }

  close(): void {
    if (this._closed)
      return;
    this._closed = true;
    chrome.debugger.onEvent.removeListener(this._onDebuggerEvent);
    chrome.debugger.onDetach.removeListener(this._onDebuggerDetach);
    chrome.tabs.onCreated.removeListener(this._onTabCreated);
    chrome.tabs.onRemoved.removeListener(this._onTabRemoved);
    this._pendingReattach.clear();
    this._recentReattach.clear();
    for (const tabId of [...this._tabSessions.keys()]) {
      chrome.debugger.detach({ tabId }).catch(() => {});
      this._detachTab(tabId);
    }
    this._knownTabs.clear();
    this.onclose?.('Extension server stopped');
    this.onstatechange?.();
  }

  private async _send(message: ProtocolRequest): Promise<void> {
    try {
      const result = await this._handleCommand(message.method, message.params, message.sessionId);
      this._emit({ id: message.id, sessionId: message.sessionId, result });
    } catch (error) {
      debugLog(`CDP command failed: ${message.method}`, error);
      this._emit({
        id: message.id,
        sessionId: message.sessionId,
        error: {
          message: error instanceof Error ? error.message : String(error),
          data: undefined,
        },
      });
    }
  }

  private async _handleCommand(method: string, params: any, sessionId: string | undefined): Promise<any> {
    switch (method) {
      case 'Browser.getVersion':
        return {
          protocolVersion: '1.3',
          product: 'Chrome/Extension-Bridge',
          revision: '',
          userAgent: 'Playwright-Extension',
          jsVersion: '',
        };
      case 'Browser.setDownloadBehavior':
        return {};
      case 'Target.setAutoAttach':
        if (!sessionId) {
          await this._enableAutoAttach();
          return {};
        }
        break;
      case 'Target.createTarget':
        return await this._createTarget(params?.url);
      case 'Target.closeTarget':
        return await this._closeTarget(params?.targetId);
      case 'Target.getTargetInfo':
        if (!sessionId)
          return { targetInfo: this._targetInfoForSession(undefined) };
        return { targetInfo: this._targetInfoForSession(sessionId) };
    }
    if (!sessionId)
      return await this._sendBrowserCommand(method, params);
    return await this._sendSessionCommand(sessionId, method, params);
  }

  private async _enableAutoAttach(): Promise<void> {
    this._autoAttach = true;
    await Promise.all([...this._knownTabs.keys()].map(tabId => this._attachTab(tabId)));
  }

  private async _createTarget(url: string | undefined): Promise<{ targetId: string | undefined }> {
    const tab = await chrome.tabs.create({ url });
    if (tab.id === undefined)
      throw new Error('Failed to create tab');
    this._knownTabs.set(tab.id, tab);
    const tabSession = await this._attachTab(tab.id);
    return { targetId: tabSession.targetInfo?.targetId };
  }

  private async _closeTarget(targetId: string | undefined): Promise<{ success: boolean }> {
    const tabSession = targetId ? this._findTabSession(session => session.targetInfo?.targetId === targetId) : undefined;
    if (!tabSession)
      return { success: false };
    await chrome.tabs.remove(tabSession.tabId);
    return { success: true };
  }

  private _targetInfoForSession(sessionId: string | undefined): any {
    if (sessionId)
      return this._findTabSession(session => session.sessionId === sessionId)?.targetInfo;
    return this._tabSessions.values().next().value?.targetInfo;
  }

  private async _sendBrowserCommand(method: string, params: any): Promise<any> {
    const tabSession = this._tabSessions.values().next().value;
    if (!tabSession)
      throw new Error(`No attached tab to forward browser-level command: ${method}`);
    return await chrome.debugger.sendCommand({ tabId: tabSession.tabId }, method, params);
  }

  private async _sendSessionCommand(sessionId: string, method: string, params: any): Promise<any> {
    let tabSession = this._findTabSession(session => session.sessionId === sessionId);
    let cdpSessionId: string | undefined;
    if (!tabSession) {
      tabSession = this._findTabSession(session => session.childSessions.has(sessionId));
      cdpSessionId = sessionId;
    }
    if (!tabSession)
      throw new Error(`No tab found for sessionId: ${sessionId}`);
    return await chrome.debugger.sendCommand({
      tabId: tabSession.tabId,
      sessionId: cdpSessionId,
    }, method, params);
  }

  private async _attachTab(tabId: number): Promise<TabSession> {
    const existing = this._tabSessions.get(tabId);
    if (existing)
      return existing;
    await chrome.debugger.attach({ tabId }, '1.3');
    const result = await chrome.debugger.sendCommand({ tabId }, 'Target.getTargetInfo') as { targetInfo?: any };
    const sessionId = `pw-tab-${this._nextSessionId++}`;
    const tabSession: TabSession = {
      tabId,
      sessionId,
      targetInfo: result?.targetInfo,
      childSessions: new Set(),
    };
    this._tabSessions.set(tabId, tabSession);
    this._pendingReattach.delete(tabId);
    this.ontabattached?.(tabId);
    this.onstatechange?.();
    this._emit({
      method: 'Target.attachedToTarget',
      params: {
        sessionId,
        targetInfo: { ...tabSession.targetInfo, attached: true },
        waitingForDebugger: false,
      },
    });
    return tabSession;
  }

  private _detachTab(tabId: number): void {
    const tabSession = this._tabSessions.get(tabId);
    if (!tabSession)
      return;
    this._tabSessions.delete(tabId);
    this.ontabdetached?.(tabId);
    this.onstatechange?.();
    this._emit({
      method: 'Target.detachedFromTarget',
      params: {
        sessionId: tabSession.sessionId,
        targetId: tabSession.targetInfo?.targetId,
      },
    });
  }

  private _onDebuggerEvent = (source: chrome.debugger.Debuggee, method: string, params?: object): void => {
    if (source.tabId === undefined)
      return;
    const tabSession = this._tabSessions.get(source.tabId);
    if (!tabSession)
      return;
    const childSessionId = (params as { sessionId?: string } | undefined)?.sessionId;
    if (method === 'Target.attachedToTarget' && childSessionId)
      tabSession.childSessions.add(childSessionId);
    else if (method === 'Target.detachedFromTarget' && childSessionId)
      tabSession.childSessions.delete(childSessionId);
    this._emit({
      sessionId: (source as chrome.debugger.Debuggee & { sessionId?: string }).sessionId || tabSession.sessionId,
      method,
      params,
    });
  };

  private _onDebuggerDetach = (source: chrome.debugger.Debuggee, reason: `${chrome.debugger.DetachReason}`): void => {
    if (source.tabId === undefined || !this._tabSessions.has(source.tabId))
      return;
    if (reason === 'target_closed')
      this._maybeScheduleReattach(source.tabId);
    this._detachTab(source.tabId);
  };

  private _onTabCreated = (tab: chrome.tabs.Tab): void => {
    if (tab.openerTabId === undefined || !this._tabSessions.has(tab.openerTabId))
      return;
    void this.addTab(tab).catch(error => debugLog(`Failed to attach opened tab ${tab.id}:`, error));
  };

  private _onTabRemoved = (tabId: number): void => {
    if (!this._knownTabs.has(tabId))
      return;
    this._knownTabs.delete(tabId);
    this._pendingReattach.delete(tabId);
    if (!this._tabSessions.has(tabId)) {
      this.onstatechange?.();
      return;
    }
    this._detachTab(tabId);
  };

  private _maybeScheduleReattach(tabId: number): boolean {
    if (this._closed || !this._knownTabs.has(tabId) || this._recentReattach.has(tabId))
      return false;
    this._recentReattach.add(tabId);
    setTimeout(() => this._recentReattach.delete(tabId), REATTACH_COOLDOWN_MS);
    this._pendingReattach.add(tabId);
    this.onstatechange?.();
    setTimeout(() => void this._tryReattach(tabId), REATTACH_DELAY_MS);
    return true;
  }

  private async _tryReattach(tabId: number): Promise<void> {
    if (this._closed || !this._pendingReattach.has(tabId))
      return;
    try {
      const tab = await chrome.tabs.get(tabId);
      if (this._closed || !this._pendingReattach.has(tabId))
        return;
      this._knownTabs.set(tabId, tab);
      await this._attachTab(tabId);
    } catch {
      this._pendingReattach.delete(tabId);
      this.onstatechange?.();
      return;
    }
    setTimeout(() => {
      if (!this._tabSessions.has(tabId))
        this._pendingReattach.delete(tabId);
      this.onstatechange?.();
    }, REATTACH_VERIFY_MS);
  }

  private _findTabSession(predicate: (session: TabSession) => boolean): TabSession | undefined {
    for (const session of this._tabSessions.values()) {
      if (predicate(session))
        return session;
    }
    return undefined;
  }

  private _emit(message: ProtocolResponse): void {
    this.onmessage?.(message);
  }
}
