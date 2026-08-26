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

function normalizeParts(parts: string[]): string[] {
  const result: string[] = [];
  for (const part of parts) {
    if (!part || part === '.')
      continue;
    if (part === '..')
      result.pop();
    else
      result.push(part);
  }
  return result;
}

export const sep = '/';
export const delimiter = ':';

export function join(...parts: string[]): string {
  return normalizeParts(parts.join('/').split('/')).join('/');
}

export function normalize(value: string): string {
  const absolute = value.startsWith('/');
  const result = normalizeParts(value.split('/')).join('/');
  return absolute ? `/${result}` : result || '.';
}

export function resolve(...parts: string[]): string {
  return '/' + join(...parts);
}

export function dirname(value: string): string {
  const index = value.lastIndexOf('/');
  return index <= 0 ? '.' : value.slice(0, index);
}

export function basename(value: string, suffix?: string): string {
  const result = value.slice(value.lastIndexOf('/') + 1);
  return suffix && result.endsWith(suffix) ? result.slice(0, -suffix.length) : result;
}

export function extname(value: string): string {
  const name = basename(value);
  const index = name.lastIndexOf('.');
  return index <= 0 ? '' : name.slice(index);
}

export function isAbsolute(value: string): boolean {
  return value.startsWith('/');
}

export function relative(from: string, to: string): string {
  const fromParts = normalizeParts(from.split('/'));
  const toParts = normalizeParts(to.split('/'));
  while (fromParts[0] === toParts[0]) {
    fromParts.shift();
    toParts.shift();
  }
  return [...fromParts.map(() => '..'), ...toParts].join('/');
}

export function parse(value: string) {
  const dir = dirname(value);
  const base = basename(value);
  const ext = extname(base);
  return { root: value.startsWith('/') ? '/' : '', dir, base, ext, name: base.slice(0, base.length - ext.length) };
}

export function format(value: { dir?: string; root?: string; base?: string; name?: string; ext?: string }): string {
  return join(value.dir || value.root || '', value.base || `${value.name || ''}${value.ext || ''}`);
}

export default { sep, delimiter, join, normalize, resolve, dirname, basename, extname, isAbsolute, relative, parse, format };
