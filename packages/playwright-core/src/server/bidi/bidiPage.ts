/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { RegisteredListener } from '../../utils/eventsHelper';
import { eventsHelper } from '../../utils/eventsHelper';
import { ManualPromise } from '../../utils/manualPromise';
import { assert } from '../../utils';
import type * as accessibility from '../accessibility';
import * as dom from '../dom';
import type * as frames from '../frames';
import { type InitScript, Page, type PageDelegate } from '../page';
import type { Progress } from '../progress';
import type * as types from '../types';
import type { BidiBrowserContext } from './bidiBrowser';
import { BidiSession } from './bidiConnection';
import { RawKeyboardImpl, RawMouseImpl, RawTouchscreenImpl } from './bidiInput';
import * as bidiTypes from './bidi-types';
import { BidiExecutionContext } from './bidiExecutionContext';

const UTILITY_WORLD_NAME = '__playwright_utility_world__';

export class BidiPage implements PageDelegate {
  readonly rawMouse: RawMouseImpl;
  readonly rawKeyboard: RawKeyboardImpl;
  readonly rawTouchscreen: RawTouchscreenImpl;
  readonly _page: Page;
  // private readonly _pagePromise = new ManualPromise<Page | Error>();
  private readonly _pagePromise: Promise<Page | Error>;
  private readonly _session: BidiSession;
  readonly _opener: BidiPage | null;
  private readonly _realmToContext: Map<string, dom.FrameExecutionContext>;
  private _sessionListeners: RegisteredListener[] = [];
  readonly _browserContext: BidiBrowserContext;
  _initializedPage: Page | null = null;

  constructor(browserContext: BidiBrowserContext, bidiSession: BidiSession, opener: BidiPage | null) {
    this._session = bidiSession;
    this._opener = opener;
    this.rawKeyboard = new RawKeyboardImpl(bidiSession);
    this.rawMouse = new RawMouseImpl(bidiSession);
    this.rawTouchscreen = new RawTouchscreenImpl(bidiSession);
    this._realmToContext = new Map();
    this._page = new Page(this, browserContext);
    this.rawMouse.setPage(this._page);
    this._browserContext = browserContext;
    this._page.on(Page.Events.FrameDetached, (frame: frames.Frame) => this._removeContextsForFrame(frame, false));
    this._sessionListeners = [
      eventsHelper.addEventListener(bidiSession, 'script.realmCreated', this._onRealmCreated.bind(this)),
      eventsHelper.addEventListener(bidiSession, 'script.realmDestroyed', this._onRealmDestroyed.bind(this)),
      eventsHelper.addEventListener(bidiSession, 'browsingContext.contextDestroyed', this._onBrowsingContextDestroyed.bind(this)),
      eventsHelper.addEventListener(bidiSession, 'browsingContext.navigationStarted', this._onNavigationStarted.bind(this)),
      eventsHelper.addEventListener(bidiSession, 'browsingContext.navigationAborted', this._onNavigationAborted.bind(this)),
      eventsHelper.addEventListener(bidiSession, 'browsingContext.navigationFailed', this._onNavigationFailed.bind(this)),
      eventsHelper.addEventListener(bidiSession, 'browsingContext.fragmentNavigated', this._onFragmentNavigated.bind(this)),
      eventsHelper.addEventListener(bidiSession, 'browsingContext.domContentLoaded', this._onDomContentLoaded.bind(this)),
      eventsHelper.addEventListener(bidiSession, 'browsingContext.load', this._onLoad.bind(this)),
    ];

    // Initialize main frame.
    this._pagePromise = this._initialize().finally(async () => {
      await this._page.initOpener(this._opener);
    }).then(() => {
      this._initializedPage = this._page;
      this._page.reportAsNew();
      return this._page;
    }).catch(e => {
      this._page.reportAsNew(e);
      return e;
    });

  }

  private async _initialize() {
    const { contexts } = await this._session.send('browsingContext.getTree', { root: this._session.sessionId});
    this._handleFrameTree(contexts[0]);
  }

  private _handleFrameTree(frameTree: bidiTypes.BrowsingContext.Info ) {
    this._onFrameAttached(frameTree.context, frameTree.parent || null);
    // this._onFrameNavigated(frameTree.context, true);
    if (!frameTree.children)
      return;

    for (const child of frameTree.children)
      this._handleFrameTree(child);
  }

  // private _onFrameNavigated(framePayload: Protocol.Page.Frame, initial: boolean) {
  //   this._page._frameManager.frameCommittedNewDocumentNavigation(framePayload.id, framePayload.url + (framePayload.urlFragment || ''), framePayload.name || '', framePayload.loaderId, initial);
  //   if (!initial)
  //     this._firstNonInitialNavigationCommittedFulfill();
  // }

  potentiallyUninitializedPage(): Page {
    return this._page;
  }

  didClose() {
    this._session.dispose();
    eventsHelper.removeEventListeners(this._sessionListeners);
    this._page._didClose();
  }

  async pageOrError(): Promise<Page | Error> {
    // TODO: Wait for first execution context to be created and maybe about:blank navigated.
    return this._pagePromise;
  }

  private _onFrameAttached(frameId: string, parentFrameId: string | null): frames.Frame {
    return this._page._frameManager.frameAttached(frameId, parentFrameId);
  }

  private _removeContextsForFrame(frame: frames.Frame, notifyFrame: boolean) {
    for (const [contextId, context] of this._realmToContext) {
      if (context.frame === frame) {
        this._realmToContext.delete(contextId);
        if (notifyFrame)
          frame._contextDestroyed(context);
      }
    }
  }

  private _onRealmCreated(realmInfo: bidiTypes.Script.RealmInfo) {
    if (this._realmToContext.has(realmInfo.realm))
      return;
    if (realmInfo.type !== 'window')
      return;
    const frame = this._page._frameManager.frame(realmInfo.context);
    if (!frame)
      return;
    const delegate = new BidiExecutionContext(this._session, realmInfo);
    let worldName: types.World|null = null;
    if (!realmInfo.sandbox) {
      worldName = 'main';
      // Force creating utility world every time the main world is created (e.g. due to navigation).
      this._touchUtilityWorld(realmInfo.context);
    } else if (realmInfo.sandbox === UTILITY_WORLD_NAME)
      worldName = 'utility';
    const context = new dom.FrameExecutionContext(delegate, frame, worldName);
    (context as any)[contextDelegateSymbol] = delegate;
    if (worldName)
      frame._contextCreated(worldName, context);
    this._realmToContext.set(realmInfo.realm, context);
  }

  private async _touchUtilityWorld(context: bidiTypes.BrowsingContext.BrowsingContext) {
    await this._session.send('script.evaluate', {
      expression: '1 + 1',
      target: {
        context,
        sandbox: UTILITY_WORLD_NAME,
      },
      serializationOptions: {
        maxObjectDepth: 10,
        maxDomDepth: 10,
      },
      awaitPromise: true,
      userActivation: true,
    });
  }

  private _onRealmDestroyed(params: bidiTypes.Script.RealmDestroyedParameters) {
    const context = this._realmToContext.get(params.realm);
    if (!context)
      return;
    this._realmToContext.delete(params.realm);
    context.frame._contextDestroyed(context);
  }

  // TODO: route the message directly to the browser
  private _onBrowsingContextDestroyed(params: bidiTypes.BrowsingContext.Info) {
    this._browserContext._browser._onBrowsingContextDestroyed(params);
  }

  // TODO
  private _onNavigationStarted(params: bidiTypes.BrowsingContext.NavigationInfo) {
    this._page._frameManager.frameRequestedNavigation(params.context, params.url);
  }

  private _onDomContentLoaded(params: bidiTypes.BrowsingContext.NavigationInfo) {
    const frameId = params.context;
    const frame = this._page._frameManager.frame(frameId);
    assert(frame);
    this._page._frameManager.frameCommittedNewDocumentNavigation(frameId, params.url,  '', params.navigation || '', /* initial */ false);
    // if (!initial)
    //   this._firstNonInitialNavigationCommittedFulfill();
    this._page._frameManager.frameLifecycleEvent(frameId, 'domcontentloaded');
  }

  private _onLoad(params: bidiTypes.BrowsingContext.NavigationInfo) {
    this._page._frameManager.frameLifecycleEvent(params.context, 'load');
  }

  private _onNavigationAborted(params: bidiTypes.BrowsingContext.NavigationInfo) {
    this._page._frameManager.frameAbortedNavigation(params.context, 'Navigation aborted', params.navigation || undefined);
  }

  private _onNavigationFailed(params: bidiTypes.BrowsingContext.NavigationInfo) {
    this._page._frameManager.frameAbortedNavigation(params.context, 'Navigation failed', params.navigation || undefined);
  }

  private _onFragmentNavigated(params: bidiTypes.BrowsingContext.NavigationInfo) {
    this._page._frameManager.frameCommittedSameDocumentNavigation(params.context, params.url);
  }

  async navigateFrame(frame: frames.Frame, url: string, referrer: string | undefined): Promise<frames.GotoResult> {
    const { navigation } = await this._session.send('browsingContext.navigate', {
      context: frame._id,
      url,
    });
    return { newDocumentId: navigation || undefined };
  }

  async updateExtraHTTPHeaders(): Promise<void> {
  }

  async updateEmulateMedia(): Promise<void> {
  }

  async updateEmulatedViewportSize(): Promise<void> {
    await this._updateViewport();
  }

  async updateUserAgent(): Promise<void> {
  }

  async bringToFront(): Promise<void> {
  }

  async _updateViewport(): Promise<void> {
  }

  async updateRequestInterception(): Promise<void> {
  }

  async updateOffline() {
  }

  async updateHttpCredentials() {
  }

  async updateFileChooserInterception() {
  }

  async reload(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  goBack(): Promise<boolean> {
    throw new Error('Method not implemented.');
  }

  goForward(): Promise<boolean> {
    throw new Error('Method not implemented.');
  }

  async addInitScript(initScript: InitScript): Promise<void> {
    await this._updateBootstrapScript();
  }

  async removeNonInternalInitScripts() {
    await this._updateBootstrapScript();
  }

  async _updateBootstrapScript(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  async closePage(runBeforeUnload: boolean): Promise<void> {
    await this._session.send('browsingContext.close', {
      context: this._session.sessionId,
      promptUnload: runBeforeUnload,
    });
  }

  async setBackgroundColor(color?: { r: number; g: number; b: number; a: number; }): Promise<void> {
  }

  async takeScreenshot(progress: Progress, format: string, documentRect: types.Rect | undefined, viewportRect: types.Rect | undefined, quality: number | undefined, fitsViewport: boolean, scale: 'css' | 'device'): Promise<Buffer> {
    throw new Error('Method not implemented.');
  }

  async getContentFrame(handle: dom.ElementHandle): Promise<frames.Frame | null> {
    throw new Error('Method not implemented.');
  }

  async getOwnerFrame(handle: dom.ElementHandle): Promise<string | null> {
    throw new Error('Method not implemented.');
  }

  isElementHandle(remoteObject: bidiTypes.Script.RemoteValue): boolean {
    return remoteObject.type === 'node';
  }

  async getBoundingBox(handle: dom.ElementHandle): Promise<types.Rect | null> {
    throw new Error('Method not implemented.');
  }

  async scrollRectIntoViewIfNeeded(handle: dom.ElementHandle<Element>, rect?: types.Rect): Promise<'error:notvisible' | 'error:notconnected' | 'done'> {
    return await handle.evaluateInUtility(([injected, node]) => {
      node.scrollIntoView({
        block: 'center',
        inline: 'center',
        behavior: 'instant',
      });
    }, null).then(() => 'done' as const).catch(e => {
      if (e instanceof Error && e.message.includes('Node is detached from document'))
        return 'error:notconnected';
      if (e instanceof Error && e.message.includes('Node does not have a layout object'))
        return 'error:notvisible';
      throw e;
    });
  }

  async setScreencastOptions(options: { width: number, height: number, quality: number } | null): Promise<void> {
  }

  rafCountForStablePosition(): number {
    return process.platform === 'win32' ? 5 : 1;
  }

  async getContentQuads(handle: dom.ElementHandle<Element>): Promise<types.Quad[] | null> {
    const rects = await handle.evaluateInUtility(([injected, node]) => {
      const rects = node.getClientRects();
      if (!rects)
        return null;
      return [...rects].map(rect => [
        { x: rect.left, y: rect.top },
        { x: rect.right, y: rect.top },
        { x: rect.right, y: rect.bottom },
        { x: rect.left, y: rect.bottom },
      ]);
    }, null);
    if (rects === 'error:notconnected')
      return null;
    return rects as types.Quad[];
  }

  async setInputFiles(handle: dom.ElementHandle<HTMLInputElement>, files: types.FilePayload[]): Promise<void> {
    throw new Error('Method not implemented.');
  }

  async setInputFilePaths(handle: dom.ElementHandle<HTMLInputElement>, paths: string[]): Promise<void> {
    throw new Error('Method not implemented.');
  }

  async adoptElementHandle<T extends Node>(handle: dom.ElementHandle<T>, to: dom.FrameExecutionContext): Promise<dom.ElementHandle<T>> {
    throw new Error('Method not implemented.');
  }

  async getAccessibilityTree(needle?: dom.ElementHandle): Promise<{tree: accessibility.AXNode, needle: accessibility.AXNode | null}> {
    throw new Error('Method not implemented.');
  }

  async inputActionEpilogue(): Promise<void> {
  }

  async resetForReuse(): Promise<void> {
  }

  async getFrameElement(frame: frames.Frame): Promise<dom.ElementHandle> {
    throw new Error('Method not implemented.');
  }

  shouldToggleStyleSheetToSyncAnimations(): boolean {
    return true;
  }
}

const contextDelegateSymbol = Symbol('delegate');
