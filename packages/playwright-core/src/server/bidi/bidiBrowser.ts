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

import type * as channels from '@protocol/channels';
import type * as types from '../types';
import type { BrowserOptions } from '../browser';
import { Browser } from '../browser';
import { assertBrowserContextIsNotOwned, BrowserContext } from '../browserContext';
import type { SdkObject } from '../instrumentation';
import type { ConnectionTransport } from '../transport';
import { BidiConnection, BidiSession } from './bidiConnection';
import * as bidi from './bidi-types';
import { InitScript, Page, PageDelegate } from '../page';
import { eventsHelper, RegisteredListener } from '../../utils/eventsHelper';
import { BidiPage } from './bidiPage';

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const BROWSER_VERSION = '18.0';

export class BidiBrowser extends Browser {
  private readonly _connection: BidiConnection;
  readonly _browserSession: BidiSession;
  private _bidiSessionInfo!: bidi.Session.NewResult;
  readonly _contexts = new Map<string, BidiBrowserContext>();
  readonly _bidiPages = new Map<bidi.BrowsingContext.BrowsingContext, BidiPage>();
  private readonly _eventListeners: RegisteredListener[];

  static async connect(parent: SdkObject, transport: ConnectionTransport, options: BrowserOptions): Promise<BidiBrowser> {
    const browser = new BidiBrowser(parent, transport, options);
    if ((options as any).__testHookOnConnectToBrowser)
      await (options as any).__testHookOnConnectToBrowser();
    const sessionStatus = await browser._browserSession.send('session.status', {});
    if (!sessionStatus.ready)
      throw new Error('Bidi session is not ready. ' + sessionStatus.message);

    browser._bidiSessionInfo = await browser._browserSession.send('session.new', {
      capabilities: {
        alwaysMatch: {
          acceptInsecureCerts: false,
          unhandledPromptBehavior: {
            default: bidi.Session.UserPromptHandlerType.Ignore,
          },
          webSocketUrl: true
        }
      }
    });

    await browser._browserSession.send('session.subscribe', {
      events: [
        'browsingContext',
        'network',
        'log',
        'script',
      ],
    });
    return browser;
  }

  constructor(parent: SdkObject, transport: ConnectionTransport, options: BrowserOptions) {
    super(parent, options);
    this._connection = new BidiConnection(transport, this._onDisconnect.bind(this), options.protocolLogger, options.browserLogsCollector);
    this._browserSession = this._connection.browserSession;
    this._eventListeners = [
      eventsHelper.addEventListener(this._browserSession, 'browsingContext.contextCreated', this._onBrowsingContextCreated.bind(this)),
      // eventsHelper.addEventListener(this._browserSession, 'browsingContext.contextDestroyed', this._onBrowsingContextDestroyed.bind(this)),
    ];
  }

  _onDisconnect() {
    this._didClose();
  }
  // override async close(options: { reason?: string; }): Promise<void> {
  //   const { contexts } = await this._browserSession.send('browsingContext.getTree', { maxDepth: 1 });
  //   await Promise.all(contexts.map(c => this._browserSession.send('browsingContext.close', { context: c.context })));
  //   return super.close(options);
  // }

  async doCreateNewContext(options: channels.BrowserNewContextParams): Promise<BrowserContext> {
    if (options.isMobile)
      throw new Error('options.isMobile is not supported in Firefox');
    const { userContext } = await this._browserSession.send('browser.createUserContext', {});
    const context = new BidiBrowserContext(this, userContext, options);
    await context._initialize();
    this._contexts.set(userContext, context);
    return context;
  }

  contexts(): BrowserContext[] {
    return Array.from(this._contexts.values());
  }

  version(): string {
    return BROWSER_VERSION;
  }

  userAgent(): string {
    return DEFAULT_USER_AGENT;
  }

  isConnected(): boolean {
    return !this._connection.isClosed();
  }

  private _onBrowsingContextCreated(event: bidi.BrowsingContext.Info) {
    if (event.parent) {
      const parentFrameId = event.parent;
      for (const page of this._bidiPages.values()) {
        const parentFrame = page._page._frameManager.frame(parentFrameId);
        if (!parentFrame)
          continue;
        page._session.addFrameBrowsingContext(event.context);
        page._page._frameManager.frameAttached(event.context, parentFrameId);
        return;
      }
      return;
    }
    let context = this._contexts.get(event.userContext);
    if (!context)
      context = this._defaultContext as BidiBrowserContext;
    if (!context)
      return;
    const session = this._connection.createMainFrameBrowsingContextSession(event.context);
    const opener = event.originalOpener && this._bidiPages.get(event.originalOpener);
    const page = new BidiPage(context, session, opener || null);
    this._bidiPages.set(event.context, page);
  }

  _onBrowsingContextDestroyed(event: bidi.BrowsingContext.Info) {
    if (event.parent) {
      this._browserSession.removeFrameBrowsingContext(event.context);
      const parentFrameId = event.parent;
      for (const page of this._bidiPages.values()) {
        const parentFrame = page._page._frameManager.frame(parentFrameId);
        if (!parentFrame)
          continue;
        page._page._frameManager.frameDetached(event.context);
        return;
      }
      return;
    }
    const bidiPage = this._bidiPages.get(event.context);
    if (!bidiPage)
      return
    bidiPage.didClose();
    this._bidiPages.delete(event.context);
  }
}

export class BidiBrowserContext extends BrowserContext {
  declare readonly _browser: BidiBrowser;

  constructor(browser: BidiBrowser, browserContextId: string | undefined, options: channels.BrowserNewContextParams) {
    super(browser, options, browserContextId);
    this._authenticateProxyViaHeader();
  }

  pages(): Page[] {
    return [];
  }

  async newPageDelegate(): Promise<PageDelegate> {
    assertBrowserContextIsNotOwned(this);
    const { context } = await this._browser._browserSession.send('browsingContext.create', {
      type: bidi.BrowsingContext.CreateType.Window,
      userContext: this._browserContextId,
    });
    return this._browser._bidiPages.get(context)!;
  }

  async doGetCookies(urls: string[]): Promise<channels.NetworkCookie[]> {
    throw new Error();
  }

  async addCookies(cookies: channels.SetNetworkCookie[]) {
    throw new Error();
  }

  async doClearCookies() {
    throw new Error();
  }

  async doGrantPermissions(origin: string, permissions: string[]) {
  }

  async doClearPermissions() {
  }

  async setGeolocation(geolocation?: types.Geolocation): Promise<void> {
  }

  async setExtraHTTPHeaders(headers: types.HeadersArray): Promise<void> {
  }

  async setUserAgent(userAgent: string | undefined): Promise<void> {
  }

  async setOffline(offline: boolean): Promise<void> {
  }

  async doSetHTTPCredentials(httpCredentials?: types.Credentials): Promise<void> {
  }

  async doAddInitScript(initScript: InitScript) {
    // for (const page of this.pages())
    //   await (page._delegate as WKPage)._updateBootstrapScript();
  }

  async doRemoveNonInternalInitScripts() {
  }

  async doUpdateRequestInterception(): Promise<void> {
  }

  onClosePersistent() {}

  override async clearCache(): Promise<void> {
  }

  async doClose(reason: string | undefined) {
    // TODO: implement for persistent context
    if (!this._browserContextId)
      return;

    await this._browser._browserSession.send('browser.removeUserContext', {
      userContext: this._browserContextId
    });
    this._browser._contexts.delete(this._browserContextId);
  }

  async cancelDownload(uuid: string) {
  }
}