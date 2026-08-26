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

type BufferSourceLike = string | ArrayBufferLike | ArrayBufferView | ArrayLike<unknown> | Iterable<unknown>;

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const result = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; ++i)
    result[i] = binary.charCodeAt(i);
  return result;
}

function encodeBase64(value: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < value.length; i += 0x8000)
    binary += String.fromCharCode(...value.subarray(i, i + 0x8000));
  return btoa(binary);
}

export class Buffer extends Uint8Array {
  static override from(arrayLike: ArrayLike<number>): Buffer;
  static override from<T>(arrayLike: ArrayLike<T>, mapfn: (value: T, index: number) => number, thisArg?: any): Buffer;
  static override from(elements: Iterable<number>): Buffer;
  static override from(value: string, encoding?: BufferEncoding): Buffer;
  static override from(value: ArrayBufferLike, byteOffset?: number, length?: number): Buffer;
  static override from(value: BufferSourceLike, encodingOrOffset?: BufferEncoding | number | ((value: unknown, index: number) => number), lengthOrThisArg?: unknown): Buffer {
    if (typeof value === 'string') {
      let bytes: Uint8Array;
      if (encodingOrOffset === 'base64')
        bytes = decodeBase64(value);
      else if (encodingOrOffset === 'hex')
        bytes = Uint8Array.from(value.match(/.{1,2}/g) ?? [], byte => parseInt(byte, 16));
      else
        bytes = new TextEncoder().encode(value);
      return new Buffer(bytes);
    }
    if (value instanceof ArrayBuffer || value instanceof SharedArrayBuffer) {
      const offset = typeof encodingOrOffset === 'number' ? encodingOrOffset : 0;
      const length = typeof lengthOrThisArg === 'number' ? lengthOrThisArg : value.byteLength - offset;
      return new Buffer(Array.from(new Uint8Array(value, offset, length)));
    }
    if (ArrayBuffer.isView(value))
      return new Buffer(Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)));
    const mapfn = typeof encodingOrOffset === 'function' ? encodingOrOffset : undefined;
    const entries = Array.from(value);
    return new Buffer(mapfn ? entries.map((entry, index) => mapfn.call(lengthOrThisArg, entry, index)) : entries as number[]);
  }

  static alloc(size: number, fill = 0): Buffer {
    const result = new Buffer(size);
    result.fill(fill);
    return result;
  }

  static allocUnsafe(size: number): Buffer {
    return new Buffer(size);
  }

  static concat(values: readonly Uint8Array[], totalLength?: number): Buffer {
    const length = totalLength ?? values.reduce((result, value) => result + value.length, 0);
    const result = new Buffer(length);
    let offset = 0;
    for (const value of values) {
      result.set(value.subarray(0, length - offset), offset);
      offset += value.length;
      if (offset >= length)
        break;
    }
    return result;
  }

  static byteLength(value: string | ArrayBufferView | ArrayBuffer, encoding?: BufferEncoding): number {
    if (typeof value !== 'string')
      return value.byteLength;
    return Buffer.from(value, encoding).byteLength;
  }

  static isBuffer(value: unknown): value is Buffer {
    return value instanceof Buffer;
  }

  override slice(start?: number, end?: number): Buffer {
    return Buffer.from(super.slice(start, end));
  }

  override subarray(begin?: number, end?: number): Buffer {
    const value = super.subarray(begin, end);
    return new Buffer(value.buffer, value.byteOffset, value.byteLength);
  }

  override toString(encoding: BufferEncoding = 'utf8', start = 0, end = this.length): string {
    const value = super.subarray(start, end);
    if (encoding === 'base64')
      return encodeBase64(value);
    if (encoding === 'hex')
      return Array.from(value, byte => byte.toString(16).padStart(2, '0')).join('');
    if (encoding === 'binary' || encoding === 'latin1')
      return String.fromCharCode(...value);
    return new TextDecoder().decode(value);
  }

  equals(other: Uint8Array): boolean {
    return this.length === other.length && this.every((value, index) => value === other[index]);
  }

  readUInt32BE(offset: number): number {
    return new DataView(this.buffer, this.byteOffset, this.byteLength).getUint32(offset);
  }

  readUInt32LE(offset: number): number {
    return new DataView(this.buffer, this.byteOffset, this.byteLength).getUint32(offset, true);
  }

  writeUInt32BE(value: number, offset: number): number {
    new DataView(this.buffer, this.byteOffset, this.byteLength).setUint32(offset, value);
    return offset + 4;
  }

  writeUInt32LE(value: number, offset: number): number {
    new DataView(this.buffer, this.byteOffset, this.byteLength).setUint32(offset, value, true);
    return offset + 4;
  }
}

Object.assign(globalThis, { Buffer });

export default { Buffer };
