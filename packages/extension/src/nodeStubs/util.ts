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

export function inherits(ctor: any, superCtor: any): void {
  if (!superCtor?.prototype)
    return;
  Object.setPrototypeOf(ctor.prototype, superCtor.prototype);
  Object.setPrototypeOf(ctor, superCtor);
}

export function promisify(fn: (...args: any[]) => void): (...args: any[]) => Promise<any> {
  return (...args: any[]) => new Promise((resolve, reject) => {
    fn(...args, (error: Error | null, result: any) => error ? reject(error) : resolve(result));
  });
}

export function callbackify(fn: (...args: any[]) => Promise<any>): (...args: any[]) => void {
  return (...args: any[]) => {
    const callback = args.pop();
    void fn(...args).then((result: any) => callback(null, result), (error: Error) => callback(error));
  };
}

export const deprecate = <T extends Function>(fn: T): T => fn;
export const format = (...args: any[]) => args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
export const inspect = (value: any) => typeof value === 'string' ? value : JSON.stringify(value);
export const isDeepStrictEqual = (left: any, right: any) => JSON.stringify(left) === JSON.stringify(right);
export const stripVTControlCharacters = (value: string) => value;
export const types = {
  isAnyArrayBuffer: (value: any) => value instanceof ArrayBuffer,
  isArrayBufferView: (value: any) => ArrayBuffer.isView(value),
  isDate: (value: any) => value instanceof Date,
  isMap: (value: any) => value instanceof Map,
  isRegExp: (value: any) => value instanceof RegExp,
  isSet: (value: any) => value instanceof Set,
  isTypedArray: (value: any) => ArrayBuffer.isView(value) && !(value instanceof DataView),
};

export const TextDecoder = globalThis.TextDecoder;
export const TextEncoder = globalThis.TextEncoder;

export default {
  inherits,
  promisify,
  callbackify,
  deprecate,
  format,
  inspect,
  isDeepStrictEqual,
  stripVTControlCharacters,
  types,
  TextDecoder,
  TextEncoder,
};
