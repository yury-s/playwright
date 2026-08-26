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

import { BrowserContext, validateBrowserContextOptions } from './browserContext';
import { Download } from './download';
import { SdkObject } from './instrumentation';
import { Page } from './page';
import { ClientCertificatesProxy } from './socksClientCertificatesInterceptor';
import { TargetClosedError } from './errors';

import type * as types from './types';
import type { ProxySettings } from './types';
import type { RecentLogsCollector } from '@utils/debugLogger';
import type * as channels from './channels';
import type { ChildProcess } from 'child_process';
import type { Language } from '@isomorphic/locatorGenerators';
import type { Progress } from './progress';
import type { BrowserServer } from './browserServer';

export interface BrowserProcess {
  onclose?: ((exitCode: number | null, signal: string | null) => void);
  process?: ChildProcess;
  kill(): Promise<void>;
  close(): Promise<void>;
}

export type BrowserOptions = {
  name: string,
  browserType: 'chromium' | 'firefox' | 'webkit',
  channel?: string,
  artifactsDir: string;
  downloadsPath: string,
  tracesDir: string,
  headful?: boolean,
  persistent?: types.BrowserContextOptions,  // Undefined means no persistent context.
  browserProcess: BrowserProcess,
  customExecutablePath?: string;
  proxy?: ProxySettings,
  protocolLogger: types.ProtocolLogger,
  browserLogsCollector: RecentLogsCollector,
  slowMo?: number;
  wsEndpoint?: string;
  sdkLanguage?: Language;
  originalLaunchOptions: types.LaunchOptions;
  userDataDir?: string;
  noDefaults?: boolean;
};

export abstract class Browser extends SdkObject {

  static Events = {
    Context: 'context',
    Disconnected: 'disconnected',
  };

  readonly options: BrowserOptions;
  private _downloads = new Map<string, Download>();
  _defaultContext: BrowserContext | null = null;
  private _startedClosing = false;
  private _contextForReuse: { context: BrowserContext, hash: string } | undefined;
  _closeReason: string | undefined;
  _isBrowserCollocatedWithServer: boolean = true;
  private _server: BrowserServer | undefined;

  constructor(parent: SdkObject, options: BrowserOptions) {
    super(parent, 'browser');
    this.attribution.browser = this;
    this.options = options;
    this.instrumentation.onBrowserOpen(this);
  }

  abstract doCreateNewContext(options: types.BrowserContextOptions): Promise<BrowserContext>;
  abstract contexts(): BrowserContext[];
  abstract isConnected(): boolean;
  abstract version(): string;
  abstract userAgent(): string;

  sdkLanguage() {
    return this.options.sdkLanguage || this.attribution.playwright.options.sdkLanguage;
  }

  async newContext(progress: Progress, options: types.BrowserContextOptions): Promise<BrowserContext> {
    validateBrowserContextOptions(options, this.options);
    let clientCertificatesProxy: ClientCertificatesProxy | undefined;
    let context: BrowserContext | undefined;
    try {
      if (options.clientCertificates?.length) {
        clientCertificatesProxy = await ClientCertificatesProxy.create(progress, options);
        options = { ...options };
        options.proxyOverride = clientCertificatesProxy.proxySettings();
        options.internalIgnoreHTTPSErrors = true;
      }
      context = await progress.race(this.doCreateNewContext(options));
      context._clientCertificatesProxy = clientCertificatesProxy;
      if ((options as any).__testHookBeforeSetStorageState)
        await progress.race((options as any).__testHookBeforeSetStorageState());
      await context.setStorageState(progress, options.storageState, 'initial');
      this.emit(Browser.Events.Context, context);
      return context;
    } catch (error) {
      await context?.close(progress, { reason: 'Failed to create context' }).catch(() => {});
      await clientCertificatesProxy?.close().catch(() => {});
      throw error;
    }
  }

  async newContextForReuse(progress: Progress, params: channels.BrowserNewContextForReuseParams): Promise<BrowserContext> {
    const hash = BrowserContext.reusableContextHash(params);
    if (!this._contextForReuse || hash !== this._contextForReuse.hash || !this._contextForReuse.context.canResetForReuse()) {
      if (this._contextForReuse)
        await this._contextForReuse.context.close(progress, { reason: 'Context reused' });
      this._contextForReuse = { context: await this.newContext(progress, params), hash };
      return this._contextForReuse.context;
    }
    await this._contextForReuse.context.resetForReuse(progress, params);
    return this._contextForReuse.context;
  }

  contextForReuse() {
    return this._contextForReuse?.context;
  }

  downloadCreated(page: Page, uuid: string, url: string, suggestedFilename?: string, downloadFilename?: string) {
    const download = new Download(page, this.options.downloadsPath || '', uuid, url, suggestedFilename, downloadFilename);
    this._downloads.set(uuid, download);
  }

  downloadFilenameSuggested(uuid: string, suggestedFilename: string) {
    const download = this._downloads.get(uuid);
    if (!download)
      return;
    download.filenameSuggested(suggestedFilename);
  }

  downloadFinished(uuid: string, error?: string) {
    const download = this._downloads.get(uuid);
    if (!download)
      return;
    download.artifact.reportFinished(error ? new Error(error) : undefined);
    this._downloads.delete(uuid);
  }

  async startServer(progress: Progress, title: string, options: channels.BrowserStartServerOptions): Promise<{ endpoint: string }> {
    if (!this._server) {
      const { BrowserServer } = await import('./browserServer');
      this._server = new BrowserServer(this);
    }
    return await progress.race(this._server.start(title, options));
  }

  async stopServer(progress: Progress): Promise<void> {
    if (this._server)
      await progress.race(this._server.stop());
  }

  protected didClose() {
    for (const context of this.contexts())
      context.browserClosed();
    if (this._defaultContext)
      this._defaultContext.browserClosed();
    for (const download of this._downloads.values())
      download.artifact.reportFinished(new TargetClosedError(undefined));
    void this._server?.stop().catch(() => {});
    this.emit(Browser.Events.Disconnected);
    this.instrumentation.onBrowserClose(this);
  }

  async close(progress: Progress, options: { reason?: string }) {
    return await progress.race(this._close(options));
  }

  private async _close(options: { reason?: string }) {
    if (!this._startedClosing) {
      if (options.reason)
        this._closeReason = options.reason;
      this._startedClosing = true;
      await this.options.browserProcess.close();
    }
    if (this.isConnected())
      await new Promise(x => this.once(Browser.Events.Disconnected, x));
  }

  async killForTests(progress: Progress) {
    await progress.race(this.options.browserProcess.kill());
    if (this.isConnected())
      await progress.race(new Promise(x => this.once(Browser.Events.Disconnected, x)));
  }
}
