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
import { BidiNetworkManager } from './bidiNetworkManager';

const UTILITY_WORLD_NAME = '__playwright_utility_world__';

export class BidiPage implements PageDelegate {
  readonly rawMouse: RawMouseImpl;
  readonly rawKeyboard: RawKeyboardImpl;
  readonly rawTouchscreen: RawTouchscreenImpl;
  readonly _page: Page;
  // private readonly _pagePromise = new ManualPromise<Page | Error>();
  private readonly _pagePromise: Promise<Page | Error>;
  readonly _session: BidiSession;
  readonly _opener: BidiPage | null;
  private readonly _realmToContext: Map<string, dom.FrameExecutionContext>;
  private _sessionListeners: RegisteredListener[] = [];
  readonly _browserContext: BidiBrowserContext;
  readonly _networkManager: BidiNetworkManager;
  _initializedPage: Page | null = null;

  constructor(browserContext: BidiBrowserContext, bidiSession: BidiSession, opener: BidiPage | null) {
    this._session = bidiSession;
    this._opener = opener;
    this.rawKeyboard = new RawKeyboardImpl(bidiSession);
    this.rawMouse = new RawMouseImpl(bidiSession);
    this.rawTouchscreen = new RawTouchscreenImpl(bidiSession);
    this._realmToContext = new Map();
    this._page = new Page(this, browserContext);
    this._browserContext = browserContext;
    this._networkManager = new BidiNetworkManager(this._session, this._page, this._onNavigationResponseStarted.bind(this));
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
      eventsHelper.addEventListener(bidiSession, 'log.entryAdded', this._onLogEntryAdded.bind(this)),
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
    await this._session.sendMayFail('script.evaluate', {
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

  private _onNavigationStarted(params: bidiTypes.BrowsingContext.NavigationInfo) {
    const frameId = params.context;
    this._page._frameManager.frameRequestedNavigation(frameId, params.navigation!);

    const url = params.url.toLowerCase();
    if (url.startsWith('file:') || url.startsWith('data:') || url === 'about:blank') {
      // Navigation to file urls doesn't emit network events, so we fire 'commit' event right when navigation is started.
      // Doing it in domcontentload would be too late as we'd clear frame tree.
      const frame = this._page._frameManager.frame(frameId)!;
      if (frame)
        this._page._frameManager.frameCommittedNewDocumentNavigation(frameId, params.url, '', params.navigation!, /* initial */ false);
    }
  }

  // TODO: there is no separate event for committed navigation, so we approximate it with responseStarted.
  private _onNavigationResponseStarted(params: bidiTypes.Network.ResponseStartedParameters) {
    const frameId = params.context!;
    const frame = this._page._frameManager.frame(frameId);
    assert(frame);
    this._page._frameManager.frameCommittedNewDocumentNavigation(frameId, params.response.url, '', params.navigation!, /* initial */ false);
    // if (!initial)
    //   this._firstNonInitialNavigationCommittedFulfill();
  }

  private _onDomContentLoaded(params: bidiTypes.BrowsingContext.NavigationInfo) {
    const frameId = params.context;
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

  private _onLogEntryAdded(params: bidiTypes.Log.Entry) {
    if (params.type !== 'console')
      return;
    const entry: bidiTypes.Log.ConsoleLogEntry = params as bidiTypes.Log.ConsoleLogEntry;
    const context = this._realmToContext.get(params.source.realm);
    if (!context)
      return;
    const callFrame = params.stackTrace?.callFrames[0];
    const location = callFrame ?? { url: '', lineNumber: 1, columnNumber: 1 };
    this._page._addConsoleMessage(entry.method, entry.args.map(arg => context.createHandle({ objectId: (arg as any).handle, ...arg })), location, params.text || undefined);
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
    const executionContext = toBidiExecutionContext(handle._context);
    const contentWindow = await executionContext.rawCallFunction('e => e.contentWindow', { handle: handle._objectId });
    if (contentWindow.type === 'window') {
      const frameId = contentWindow.value.context;
      const result = this._page._frameManager.frame(frameId);
      return result;
    }
    return null;
  }

  async getOwnerFrame(handle: dom.ElementHandle): Promise<string | null> {
    throw new Error('Method not implemented.');
  }

  isElementHandle(remoteObject: bidiTypes.Script.RemoteValue): boolean {
    return remoteObject.type === 'node';
  }

  async getBoundingBox(handle: dom.ElementHandle): Promise<types.Rect | null> {
    const box = await handle.evaluate(element => {
      if (!(element instanceof Element))
        return null;
      const rect = element.getBoundingClientRect();
      return {x: rect.x, y: rect.y, width: rect.width, height: rect.height};
    });
    if (!box)
      return null;
    const position = await this._framePosition(handle._frame);
    if (!position)
      return null;
    box.x += position.x;
    box.y += position.y;
    return box
  }

  // TODO: move to Frame.
  private async _framePosition(frame: frames.Frame): Promise<types.Point | null> {
    if (frame === this._page.mainFrame())
      return { x: 0, y: 0 };
    const element = await frame.frameElement();
    const box = await element.boundingBox();
    if (!box)
      return null;
    const style = await element.evaluateInUtility(([injected, iframe]) => injected.describeIFrameStyle(iframe as Element), {}).catch(e => 'error:notconnected' as const);
    if (style === 'error:notconnected' || style === 'transformed')
      return null;
    // Content box is offset by border and padding widths.
    box.x += style.left;
    box.y += style.top;
    return box;
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

  async getContentQuads(handle: dom.ElementHandle<Element>): Promise<types.Quad[] | null | 'error:notconnected'> {
    let quads = await handle.evaluateInUtility(([injected, node]) => {
      if (!node.isConnected)
        return 'error:notconnected';
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
    if (!quads || quads === 'error:notconnected')
      return quads;
    // TODO: consider transforming quads to support clicks in iframes.
    //
    // if (handle._frame !== this._page.mainFrame()) {
    //   const frameElement = await handle._frame.frameElement();
    //   quads = await frameElement.evaluateInUtility(([injected, iframe, quads]) => {
    //     const transform = getComputedStyle(iframe as Element).transform;
    //     if (transform === 'none')
    //       return quads;
    //     const matrix = new DOMMatrixReadOnly(transform);
    //     for (const quad of quads) {
    //       for (const point of quad) {
    //         const p = new DOMPoint(point.x, point.y);
    //         const transformed = matrix.transformPoint(p);
    //         point.x = transformed.x;
    //         point.y = transformed.y;
    //       }
    //     }
    //     return quads;
    //   }, quads).catch(e => 'error:notconnected' as const);
    //   if (!quads || quads === 'error:notconnected')
    //     return null;
    // }
    const position = await this._framePosition(handle._frame);
    if (!position)
      return null;
    quads.forEach(quad => quad.forEach(point => {
      point.x += position.x;
      point.y += position.y;
    }));
    return quads as types.Quad[];
  }

  async setInputFiles(handle: dom.ElementHandle<HTMLInputElement>, files: types.FilePayload[]): Promise<void> {
    throw new Error('Method not implemented.');
  }

  async setInputFilePaths(handle: dom.ElementHandle<HTMLInputElement>, paths: string[]): Promise<void> {
    throw new Error('Method not implemented.');
  }

  async adoptElementHandle<T extends Node>(handle: dom.ElementHandle<T>, to: dom.FrameExecutionContext): Promise<dom.ElementHandle<T>> {
    const fromContext = toBidiExecutionContext(handle._context);
    const shared = await fromContext.rawCallFunction('x => x',  { handle: handle._objectId });
    // TODO: store sharedId in the handle.
    if (!('sharedId' in shared))
      throw new Error('Element is not a node');
    const sharedId = shared.sharedId!;
    const executionContext = toBidiExecutionContext(to);
    const result = await executionContext.rawCallFunction('x => x',  { sharedId });
    if ('handle' in result)
      return to.createHandle({ objectId: result.handle!, ...result }) as dom.ElementHandle<T>;
    throw new Error('Failed to adopt element handle.');
  }

  async getAccessibilityTree(needle?: dom.ElementHandle): Promise<{tree: accessibility.AXNode, needle: accessibility.AXNode | null}> {
    throw new Error('Method not implemented.');
  }

  async inputActionEpilogue(): Promise<void> {
  }

  async resetForReuse(): Promise<void> {
  }

  async getFrameElement(frame: frames.Frame): Promise<dom.ElementHandle> {
    const parent = frame.parentFrame();
    if (!parent)
      throw new Error('Frame has been detached.');
    const parentContext = await parent._mainContext();
    const list = await parentContext.evaluateHandle(() => { return [...document.querySelectorAll('iframe,frame')]; });
    const length = await list.evaluate(list => list.length);
    let foundElement = null;
    for (let i = 0; i < length; i++) {
      const element = await list.evaluateHandle((list, i) => list[i], i);
      const candidate = await element.contentFrame();
      if (frame === candidate) {
        foundElement = element;
        break;
      } else {
        element.dispose();
      }
    }
    list.dispose();
    if (!foundElement)
      throw new Error('Frame has been detached.');
    return foundElement;
  }

  shouldToggleStyleSheetToSyncAnimations(): boolean {
    return true;
  }

  useMainWorldForSetContent(): boolean {
    return true;
  }
}

function toBidiExecutionContext(executionContext: dom.FrameExecutionContext): BidiExecutionContext {
  return (executionContext as any)[contextDelegateSymbol] as BidiExecutionContext;
}

const contextDelegateSymbol = Symbol('delegate');
