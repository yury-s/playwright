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

// This file is generated by generate_channels.js, do not edit manually.

export const slowMoActions = new Set([
  'Page.goBack',
  'Page.goForward',
  'Page.reload',
  'Page.keyboardDown',
  'Page.keyboardUp',
  'Page.keyboardInsertText',
  'Page.keyboardType',
  'Page.keyboardPress',
  'Page.mouseMove',
  'Page.mouseDown',
  'Page.mouseUp',
  'Page.mouseClick',
  'Page.mouseWheel',
  'Page.touchscreenTap',
  'Frame.blur',
  'Frame.check',
  'Frame.click',
  'Frame.dragAndDrop',
  'Frame.dblclick',
  'Frame.dispatchEvent',
  'Frame.fill',
  'Frame.focus',
  'Frame.goto',
  'Frame.hover',
  'Frame.press',
  'Frame.selectOption',
  'Frame.setInputFiles',
  'Frame.tap',
  'Frame.type',
  'Frame.uncheck',
  'ElementHandle.check',
  'ElementHandle.click',
  'ElementHandle.dblclick',
  'ElementHandle.dispatchEvent',
  'ElementHandle.fill',
  'ElementHandle.focus',
  'ElementHandle.hover',
  'ElementHandle.press',
  'ElementHandle.scrollIntoViewIfNeeded',
  'ElementHandle.selectOption',
  'ElementHandle.selectText',
  'ElementHandle.setInputFiles',
  'ElementHandle.tap',
  'ElementHandle.type',
  'ElementHandle.uncheck'
]);

export const commandsWithTracingSnapshots = new Set([
  'EventTarget.waitForEventInfo',
  'BrowserContext.waitForEventInfo',
  'Page.waitForEventInfo',
  'WebSocket.waitForEventInfo',
  'ElectronApplication.waitForEventInfo',
  'AndroidDevice.waitForEventInfo',
  'Page.emulateMedia',
  'Page.goBack',
  'Page.goForward',
  'Page.reload',
  'Page.expectScreenshot',
  'Page.screenshot',
  'Page.setViewportSize',
  'Page.setZoom',
  'Page.keyboardDown',
  'Page.keyboardUp',
  'Page.keyboardInsertText',
  'Page.keyboardType',
  'Page.keyboardPress',
  'Page.mouseMove',
  'Page.mouseDown',
  'Page.mouseUp',
  'Page.mouseClick',
  'Page.mouseWheel',
  'Page.touchscreenTap',
  'Page.accessibilitySnapshot',
  'Frame.evalOnSelector',
  'Frame.evalOnSelectorAll',
  'Frame.addScriptTag',
  'Frame.addStyleTag',
  'Frame.ariaSnapshot',
  'Frame.blur',
  'Frame.check',
  'Frame.click',
  'Frame.content',
  'Frame.dragAndDrop',
  'Frame.dblclick',
  'Frame.dispatchEvent',
  'Frame.evaluateExpression',
  'Frame.evaluateExpressionHandle',
  'Frame.fill',
  'Frame.focus',
  'Frame.getAttribute',
  'Frame.goto',
  'Frame.hover',
  'Frame.innerHTML',
  'Frame.innerText',
  'Frame.inputValue',
  'Frame.isChecked',
  'Frame.isDisabled',
  'Frame.isEnabled',
  'Frame.isHidden',
  'Frame.isVisible',
  'Frame.isEditable',
  'Frame.press',
  'Frame.querySelector',
  'Frame.querySelectorAll',
  'Frame.queryCount',
  'Frame.selectOption',
  'Frame.setContent',
  'Frame.setInputFiles',
  'Frame.tap',
  'Frame.textContent',
  'Frame.type',
  'Frame.uncheck',
  'Frame.waitForTimeout',
  'Frame.waitForFunction',
  'Frame.waitForSelector',
  'Frame.expect',
  'JSHandle.evaluateExpression',
  'ElementHandle.evaluateExpression',
  'JSHandle.evaluateExpressionHandle',
  'ElementHandle.evaluateExpressionHandle',
  'ElementHandle.evalOnSelector',
  'ElementHandle.evalOnSelectorAll',
  'ElementHandle.boundingBox',
  'ElementHandle.check',
  'ElementHandle.click',
  'ElementHandle.contentFrame',
  'ElementHandle.dblclick',
  'ElementHandle.dispatchEvent',
  'ElementHandle.fill',
  'ElementHandle.focus',
  'ElementHandle.hover',
  'ElementHandle.innerHTML',
  'ElementHandle.innerText',
  'ElementHandle.inputValue',
  'ElementHandle.isChecked',
  'ElementHandle.isDisabled',
  'ElementHandle.isEditable',
  'ElementHandle.isEnabled',
  'ElementHandle.isHidden',
  'ElementHandle.isVisible',
  'ElementHandle.press',
  'ElementHandle.querySelector',
  'ElementHandle.querySelectorAll',
  'ElementHandle.screenshot',
  'ElementHandle.scrollIntoViewIfNeeded',
  'ElementHandle.selectOption',
  'ElementHandle.selectText',
  'ElementHandle.setInputFiles',
  'ElementHandle.tap',
  'ElementHandle.textContent',
  'ElementHandle.type',
  'ElementHandle.uncheck',
  'ElementHandle.waitForElementState',
  'ElementHandle.waitForSelector'
]);

export const pausesBeforeInputActions = new Set([
  'Frame.check',
  'Frame.click',
  'Frame.dragAndDrop',
  'Frame.dblclick',
  'Frame.fill',
  'Frame.hover',
  'Frame.press',
  'Frame.selectOption',
  'Frame.setInputFiles',
  'Frame.tap',
  'Frame.type',
  'Frame.uncheck',
  'ElementHandle.check',
  'ElementHandle.click',
  'ElementHandle.dblclick',
  'ElementHandle.fill',
  'ElementHandle.hover',
  'ElementHandle.press',
  'ElementHandle.selectOption',
  'ElementHandle.setInputFiles',
  'ElementHandle.tap',
  'ElementHandle.type',
  'ElementHandle.uncheck'
]);
