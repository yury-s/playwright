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

type Listener = (...args: any[]) => void;

export const errorMonitor = Symbol('events.errorMonitor');
export const captureRejectionSymbol = Symbol('events.captureRejection');

export class EventEmitter {
  static defaultMaxListeners = 10;
  private _events = new Map<string | symbol, Listener[]>();

  setMaxListeners(): this {
    return this;
  }

  addListener(event: string | symbol, listener: Listener): this {
    return this.on(event, listener);
  }

  on(event: string | symbol, listener: Listener): this {
    const listeners = this._events.get(event) ?? [];
    listeners.push(listener);
    this._events.set(event, listeners);
    return this;
  }

  prependListener(event: string | symbol, listener: Listener): this {
    const listeners = this._events.get(event) ?? [];
    listeners.unshift(listener);
    this._events.set(event, listeners);
    return this;
  }

  once(event: string | symbol, listener: Listener): this {
    const wrapper = (...args: any[]) => {
      this.removeListener(event, wrapper);
      listener(...args);
    };
    return this.on(event, wrapper);
  }

  prependOnceListener(event: string | symbol, listener: Listener): this {
    const wrapper = (...args: any[]) => {
      this.removeListener(event, wrapper);
      listener(...args);
    };
    return this.prependListener(event, wrapper);
  }

  emit(event: string | symbol, ...args: any[]): boolean {
    const listeners = this._events.get(event);
    if (!listeners?.length)
      return false;
    for (const listener of [...listeners])
      listener(...args);
    return true;
  }

  removeListener(event: string | symbol, listener: Listener): this {
    const listeners = this._events.get(event);
    if (!listeners)
      return this;
    const index = listeners.indexOf(listener);
    if (index !== -1)
      listeners.splice(index, 1);
    if (!listeners.length)
      this._events.delete(event);
    return this;
  }

  off(event: string | symbol, listener: Listener): this {
    return this.removeListener(event, listener);
  }

  removeAllListeners(event?: string | symbol): this {
    if (event === undefined)
      this._events.clear();
    else
      this._events.delete(event);
    return this;
  }

  listeners(event: string | symbol): Listener[] {
    return [...(this._events.get(event) ?? [])];
  }

  rawListeners(event: string | symbol): Listener[] {
    return this.listeners(event);
  }

  listenerCount(event: string | symbol): number {
    return this._events.get(event)?.length ?? 0;
  }

  eventNames(): Array<string | symbol> {
    return [...this._events.keys()];
  }
}

export default EventEmitter;
