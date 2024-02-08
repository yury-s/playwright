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

const MIN_API_VERSION = 1;

export class PatchSupport {
  private _enabled: boolean | undefined;
  private _baseScope: string;

  constructor() {
    const pathname = new URL(self.location.href).pathname;
    this._baseScope = pathname.substring(0, pathname.lastIndexOf('/'));
  }

  static instance(): PatchSupport {
    return gInstance;
  }

  async initialize() {
    console.log('initialize!!!', new URL(self.location.href).pathname);
    if (this._enabled !== undefined)
      return;
    try {
      const response = await fetch(`${this._baseScope}/api/version`);
      const text = await response.text();
      const version = JSON.parse(text);
      this._enabled = version !== undefined && version >= MIN_API_VERSION;
    } catch (e) {
      console.error(e);
      this._enabled = false;
    }
  }

  isEnabled() {
    console.log('isEnabled', this._enabled);
    return this._enabled;
  }

  async patchImage(actualPath: string, snapshotPath: string) {
    if (!this._enabled)
      throw new Error('patch support is not available!');
    try {
      const response = await fetch(`${this._baseScope}/api/patch_image`, {
        method: 'POST',
        body: JSON.stringify({ actualPath, snapshotPath }),
      });
      return response.status === 200;
    } catch (e) {
      console.error(e);
      return false;
    }
  }
}

const gInstance = new PatchSupport();

