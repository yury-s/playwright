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

import fs from 'fs';

import { makeSocketPath } from '@utils/fileUtils';
import { createGuid } from '@utils/crypto';
import { PlaywrightPipeServer } from '../remote/playwrightPipeServer';
import { PlaywrightWebSocketServer } from '../remote/playwrightWebSocketServer';
import { serverRegistry } from '../serverRegistry';

import type { BrowserInfo } from '../serverRegistry';
import type * as playwright from '../..';
import type { Browser } from './browser';
import type * as channels from './channels';
import type * as types from './types';

export class BrowserServer {
  private _pipeServer?: PlaywrightPipeServer;
  private _wsServer?: PlaywrightWebSocketServer;
  private _pipeSocketPath?: string;
  private _isStarted = false;

  constructor(private _browser: Browser) {
  }

  async start(title: string, options: channels.BrowserStartServerOptions): Promise<{ endpoint: string }> {
    if (this._isStarted)
      throw new Error(`Server is already started.`);
    this._isStarted = true;

    let endpoint: string;
    if (options.host !== undefined || options.port !== undefined) {
      this._wsServer = new PlaywrightWebSocketServer(this._browser, '/' + createGuid());
      endpoint = await this._wsServer.listen(options.port ?? 0, options.host);
    } else {
      this._pipeServer = new PlaywrightPipeServer(this._browser);
      this._pipeSocketPath = await this._socketPath();
      await this._pipeServer.listen(this._pipeSocketPath);
      endpoint = this._pipeSocketPath;
    }

    const browserInfo: BrowserInfo = {
      guid: this._browser.guid,
      browserName: this._browser.options.browserType,
      launchOptions: asClientLaunchOptions(this._browser.options.originalLaunchOptions),
      userDataDir: this._browser.options.userDataDir,
    };
    await serverRegistry.create(browserInfo, {
      title,
      endpoint,
      workspaceDir: options.workspaceDir,
      metadata: options.metadata,
    });
    return { endpoint };
  }

  async stop() {
    if (!this._browser.options.userDataDir)
      await serverRegistry.delete(this._browser.guid);
    if (this._pipeSocketPath && process.platform !== 'win32')
      await fs.promises.unlink(this._pipeSocketPath).catch(() => {});
    await this._pipeServer?.close();
    await this._wsServer?.close();
    this._pipeServer = undefined;
    this._wsServer = undefined;
    this._isStarted = false;
  }

  private async _socketPath() {
    return makeSocketPath('browser', this._browser.guid.slice(0, 14));
  }
}

function asClientLaunchOptions(serverOptions: types.LaunchOptions): playwright.LaunchOptions {
  return {
    ...serverOptions,
    env: serverOptions.env ? Object.fromEntries(serverOptions.env.map(({ name, value }) => [name, value])) : undefined,
  };
}
