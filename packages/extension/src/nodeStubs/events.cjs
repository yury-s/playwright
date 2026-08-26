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

class EventEmitter {
  static defaultMaxListeners = 10;

  constructor() {
    this._events = new Map();
  }

  setMaxListeners() {
    return this;
  }

  addListener(event, listener) {
    return this.on(event, listener);
  }

  on(event, listener) {
    const listeners = this._events.get(event) || [];
    listeners.push(listener);
    this._events.set(event, listeners);
    return this;
  }

  prependListener(event, listener) {
    const listeners = this._events.get(event) || [];
    listeners.unshift(listener);
    this._events.set(event, listeners);
    return this;
  }

  once(event, listener) {
    const wrapper = (...args) => {
      this.removeListener(event, wrapper);
      listener(...args);
    };
    return this.on(event, wrapper);
  }

  prependOnceListener(event, listener) {
    const wrapper = (...args) => {
      this.removeListener(event, wrapper);
      listener(...args);
    };
    return this.prependListener(event, wrapper);
  }

  emit(event, ...args) {
    const listeners = this._events.get(event);
    if (!listeners?.length)
      return false;
    for (const listener of [...listeners])
      listener(...args);
    return true;
  }

  removeListener(event, listener) {
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

  off(event, listener) {
    return this.removeListener(event, listener);
  }

  removeAllListeners(event) {
    if (event === undefined)
      this._events.clear();
    else
      this._events.delete(event);
    return this;
  }

  listeners(event) {
    return [...(this._events.get(event) || [])];
  }

  rawListeners(event) {
    return this.listeners(event);
  }

  listenerCount(event) {
    return this._events.get(event)?.length || 0;
  }

  eventNames() {
    return [...this._events.keys()];
  }
}

module.exports = EventEmitter;
module.exports.EventEmitter = EventEmitter;
module.exports.errorMonitor = Symbol('events.errorMonitor');
module.exports.captureRejectionSymbol = Symbol('events.captureRejection');
