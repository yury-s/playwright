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

import { EventEmitter } from './events';

export class Stream extends EventEmitter {
  pipe<T>(destination: T): T {
    return destination;
  }

  destroy(error?: Error): this {
    if (error)
      this.emit('error', error);
    this.emit('close');
    return this;
  }
}

export class Readable extends Stream {
  static from(): Readable {
    return new Readable();
  }

  push(): boolean {
    return true;
  }
}

export class Writable extends Stream {
  write(chunk: any, callback?: (error?: Error | null) => void): boolean {
    callback?.(null);
    return true;
  }

  end(callback?: () => void): this {
    callback?.();
    this.emit('finish');
    return this;
  }
}

export class Duplex extends Readable {
  write(chunk: any, callback?: (error?: Error | null) => void): boolean {
    callback?.(null);
    return true;
  }

  end(callback?: () => void): this {
    callback?.();
    this.emit('finish');
    return this;
  }
}

export class Transform extends Duplex {
}

export class PassThrough extends Transform {
}

export const finished = (stream: Stream, callback: (error?: Error | null) => void) => {
  stream.once('close', () => callback(null));
  return () => {};
};

export const pipeline = (...args: any[]) => {
  const callback = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;
  callback?.(null);
  return args[args.length - 1];
};

export default Object.assign(Stream, {
  Stream,
  Readable,
  Writable,
  Duplex,
  Transform,
  PassThrough,
  finished,
  pipeline,
});
