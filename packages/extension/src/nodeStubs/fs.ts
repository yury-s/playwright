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

function notSupported(): never {
  throw new Error('Filesystem operations are not supported by the Playwright extension server');
}

export const promises = new Proxy({}, { get: () => notSupported }) as any;
export const access = notSupported;
export const chmod = notSupported;
export const copyFile = notSupported;
export const createReadStream = notSupported;
export const createWriteStream = notSupported;
export const existsSync = () => false;
export const lstat = notSupported;
export const mkdir = notSupported;
export const open = notSupported;
export const readFile = notSupported;
export const readFileSync = notSupported;
export const readdir = notSupported;
export const realpath = notSupported;
export const rename = notSupported;
export const rm = notSupported;
export const stat = notSupported;
export const unlink = notSupported;
export const watch = notSupported;
export const watchFile = notSupported;
export const writeFile = notSupported;
export const writeFileSync = notSupported;
export const statSync = notSupported;
export const readdirSync = notSupported;
export const realpathSync = notSupported;
export const unlinkSync = notSupported;
export const unwatchFile = () => {};
export const constants = {};

export default {
  promises,
  access,
  chmod,
  copyFile,
  createReadStream,
  createWriteStream,
  existsSync,
  lstat,
  mkdir,
  open,
  readFile,
  readFileSync,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  unlink,
  watch,
  watchFile,
  writeFile,
  writeFileSync,
  statSync,
  readdirSync,
  realpathSync,
  unlinkSync,
  unwatchFile,
  constants,
};
