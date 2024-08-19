/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as input from '../input';
import type { Page } from '../page';
import type * as types from '../types';
import type { BidiSession } from './bidiConnection';
import * as bidiTypes from './bidi-types';

function toModifiersMask(modifiers: Set<types.KeyboardModifier>): number {
  // From Source/WebKit/Shared/WebEvent.h
  let mask = 0;
  if (modifiers.has('Shift'))
    mask |= 1;
  if (modifiers.has('Control'))
    mask |= 2;
  if (modifiers.has('Alt'))
    mask |= 4;
  if (modifiers.has('Meta'))
    mask |= 8;
  return mask;
}

function toButtonsMask(buttons: Set<types.MouseButton>): number {
  let mask = 0;
  if (buttons.has('left'))
    mask |= 1;
  if (buttons.has('right'))
    mask |= 2;
  if (buttons.has('middle'))
    mask |= 4;
  return mask;
}

export class RawKeyboardImpl implements input.RawKeyboard {
  private readonly _pageProxySession: BidiSession;
  private _session?: BidiSession;

  constructor(session: BidiSession) {
    this._pageProxySession = session;
  }

  setSession(session: BidiSession) {
    this._session = session;
  }

  async keydown(modifiers: Set<types.KeyboardModifier>, code: string, keyCode: number, keyCodeWithoutLocation: number, key: string, location: number, autoRepeat: boolean, text: string | undefined): Promise<void> {
  }

  async keyup(modifiers: Set<types.KeyboardModifier>, code: string, keyCode: number, keyCodeWithoutLocation: number, key: string, location: number): Promise<void> {
  }

  async sendText(text: string): Promise<void> {
  }
}

export class RawMouseImpl implements input.RawMouse {
  private readonly _session: BidiSession;
  private _page?: Page;

  constructor(session: BidiSession) {
    this._session = session;
  }

  async move(x: number, y: number, button: types.MouseButton | 'none', buttons: Set<types.MouseButton>, modifiers: Set<types.KeyboardModifier>, forClick: boolean): Promise<void> {
    // TODO: bidi throws when x/y are not integers.
    x = Math.round(x);
    y = Math.round(y);
    await this._performActions([{ type: 'pointerMove', x, y }]);
  }

  async down(x: number, y: number, button: types.MouseButton, buttons: Set<types.MouseButton>, modifiers: Set<types.KeyboardModifier>, clickCount: number): Promise<void> {
    await this._performActions([{ type: 'pointerDown', button: toBidiButton(button) }]);
  }

  async up(x: number, y: number, button: types.MouseButton, buttons: Set<types.MouseButton>, modifiers: Set<types.KeyboardModifier>, clickCount: number): Promise<void> {
    await this._performActions([{ type: 'pointerUp', button: toBidiButton(button) }]);
  }

  async click(x: number, y: number, options: { delay?: number, button?: types.MouseButton, clickCount?: number } = {}) {
    x = Math.round(x);
    y = Math.round(y);
    const button = toBidiButton(options.button || 'left');
    const { delay = null, clickCount = 1 } = options;
    const actions: bidiTypes.Input.PointerSourceAction[] = [];
    actions.push({ type: 'pointerMove', x, y });
    for (let cc = 1; cc <= clickCount; ++cc) {
      actions.push({ type: 'pointerDown', button });
      if (delay)
        actions.push({ type: 'pause', duration: delay });
      actions.push({ type: 'pointerUp', button });
      if (delay && cc < clickCount)
        actions.push({ type: 'pause', duration: delay });
    }
    this._performActions(actions);
  }

  async wheel(x: number, y: number, buttons: Set<types.MouseButton>, modifiers: Set<types.KeyboardModifier>, deltaX: number, deltaY: number): Promise<void> {
  }

  setPage(page: Page) {
    this._page = page;
  }

  private async _performActions(actions: bidiTypes.Input.PointerSourceAction[]) {
    await this._session.send('input.performActions', {
      context: this._session.sessionId,
      actions: [
        {
          type: 'pointer',
          id: 'pw_mouse',
          parameters: {
            pointerType: bidiTypes.Input.PointerType.Mouse,
          },
          actions,
        }
      ]
    });
  }
}

export class RawTouchscreenImpl implements input.RawTouchscreen {
  private readonly _session: BidiSession;

  constructor(session: BidiSession) {
    this._session = session;
  }

  async tap(x: number, y: number, modifiers: Set<types.KeyboardModifier>) {
  }
}

function toBidiButton(button: string): number {
  switch (button) {
    case 'left': return 0;
    case 'right': return 2;
    case 'middle': return 1;
  }
  throw new Error('Unknown button: ' + button);
}
