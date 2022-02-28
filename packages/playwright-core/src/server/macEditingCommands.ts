/**
 * Copyright 2017 Google Inc. All rights reserved.
 * Modifications copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export const macEditingCommands: {[key: string]: string|string[]} = {
  'Backspace': 'deleteBackward:',
  'Enter': 'insertNewline:',
  'NumpadEnter': 'insertNewline:',
  'Escape': 'cancelOperation:',
  'ArrowUp': 'moveUp:',
  'ArrowDown': 'moveDown:',
  'ArrowLeft': 'moveLeft:',
  'ArrowRight': 'moveRight:',
  'F5': 'complete:',
  'Delete': 'deleteForward:',
  'Home': 'scrollToBeginningOfDocument:',
  'End': 'scrollToEndOfDocument:',
  'PageUp': 'scrollPageUp:',
  'PageDown': 'scrollPageDown:',
  'Shift+Backspace': 'deleteBackward:',
  'Shift+Enter': 'insertNewline:',
  'Shift+NumpadEnter': 'insertNewline:',
  'Shift+Escape': 'cancelOperation:',
  'Shift+ArrowUp': 'moveUpAndModifySelection:',
  'Shift+ArrowDown': 'moveDownAndModifySelection:',
  'Shift+ArrowLeft': 'moveLeftAndModifySelection:',
  'Shift+ArrowRight': 'moveRightAndModifySelection:',
  'Shift+F5': 'complete:',
  'Shift+Delete': 'deleteForward:',
  'Shift+Home': 'moveToBeginningOfDocumentAndModifySelection:',
  'Shift+End': 'moveToEndOfDocumentAndModifySelection:',
  'Shift+PageUp': 'pageUpAndModifySelection:',
  'Shift+PageDown': 'pageDownAndModifySelection:',
  'Shift+Numpad5': 'delete:',
  'Control+Tab': 'selectNextKeyView:',
  'Control+Enter': 'insertLineBreak:',
  'Control+NumpadEnter': 'insertLineBreak:',
  'Control+Quote': 'insertSingleQuoteIgnoringSubstitution:',
  'Control+KeyA': 'moveToBeginningOfParagraph:',
  'Control+KeyB': 'moveBackward:',
  'Control+KeyD': 'deleteForward:',
  'Control+KeyE': 'moveToEndOfParagraph:',
  'Control+KeyF': 'moveForward:',
  'Control+KeyH': 'deleteBackward:',
  'Control+KeyK': 'deleteToEndOfParagraph:',
  'Control+KeyL': 'centerSelectionInVisibleArea:',
  'Control+KeyN': 'moveDown:',
  'Control+KeyO': ['insertNewlineIgnoringFieldEditor:', 'moveBackward:'],
  'Control+KeyP': 'moveUp:',
  'Control+KeyT': 'transpose:',
  'Control+KeyV': 'pageDown:',
  'Control+KeyY': 'yank:',
  'Control+Backspace': 'deleteBackwardByDecomposingPreviousCharacter:',
  'Control+ArrowUp': 'scrollPageUp:',
  'Control+ArrowDown': 'scrollPageDown:',
  'Control+ArrowLeft': 'moveToLeftEndOfLine:',
  'Control+ArrowRight': 'moveToRightEndOfLine:',
  'Shift+Control+Enter': 'insertLineBreak:',
  'Shift+Control+NumpadEnter': 'insertLineBreak:',
  'Shift+Control+Tab': 'selectPreviousKeyView:',
  'Shift+Control+Quote': 'insertDoubleQuoteIgnoringSubstitution:',
  'Shift+Control+KeyA': 'moveToBeginningOfParagraphAndModifySelection:',
  'Shift+Control+KeyB': 'moveBackwardAndModifySelection:',
  'Shift+Control+KeyE': 'moveToEndOfParagraphAndModifySelection:',
  'Shift+Control+KeyF': 'moveForwardAndModifySelection:',
  'Shift+Control+KeyN': 'moveDownAndModifySelection:',
  'Shift+Control+KeyP': 'moveUpAndModifySelection:',
  'Shift+Control+KeyV': 'pageDownAndModifySelection:',
  'Shift+Control+Backspace': 'deleteBackwardByDecomposingPreviousCharacter:',
  'Shift+Control+ArrowUp': 'scrollPageUp:',
  'Shift+Control+ArrowDown': 'scrollPageDown:',
  'Shift+Control+ArrowLeft': 'moveToLeftEndOfLineAndModifySelection:',
  'Shift+Control+ArrowRight': 'moveToRightEndOfLineAndModifySelection:',
  'Alt+Backspace': 'deleteWordBackward:',
  'Alt+Enter': 'insertNewlineIgnoringFieldEditor:',
  'Alt+NumpadEnter': 'insertNewlineIgnoringFieldEditor:',
  'Alt+Escape': 'complete:',
  'Alt+ArrowUp': ['moveBackward:', 'moveToBeginningOfParagraph:'],
  'Alt+ArrowDown': ['moveForward:', 'moveToEndOfParagraph:'],
  'Alt+ArrowLeft': 'moveWordLeft:',
  'Alt+ArrowRight': 'moveWordRight:',
  'Alt+Delete': 'deleteWordForward:',
  'Alt+PageUp': 'pageUp:',
  'Alt+PageDown': 'pageDown:',
  'Shift+Alt+Backspace': 'deleteWordBackward:',
  'Shift+Alt+Enter': 'insertNewlineIgnoringFieldEditor:',
  'Shift+Alt+NumpadEnter': 'insertNewlineIgnoringFieldEditor:',
  'Shift+Alt+Escape': 'complete:',
  'Shift+Alt+ArrowUp': 'moveParagraphBackwardAndModifySelection:',
  'Shift+Alt+ArrowDown': 'moveParagraphForwardAndModifySelection:',
  'Shift+Alt+ArrowLeft': 'moveWordLeftAndModifySelection:',
  'Shift+Alt+ArrowRight': 'moveWordRightAndModifySelection:',
  'Shift+Alt+Delete': 'deleteWordForward:',
  'Shift+Alt+PageUp': 'pageUp:',
  'Shift+Alt+PageDown': 'pageDown:',
  'Control+Alt+KeyB': 'moveWordBackward:',
  'Control+Alt+KeyF': 'moveWordForward:',
  'Control+Alt+Backspace': 'deleteWordBackward:',
  'Shift+Control+Alt+KeyB': 'moveWordBackwardAndModifySelection:',
  'Shift+Control+Alt+KeyF': 'moveWordForwardAndModifySelection:',
  'Shift+Control+Alt+Backspace': 'deleteWordBackward:',
  'Meta+NumpadSubtract': 'cancel:',
  'Meta+Backspace': 'deleteToBeginningOfLine:',
  'Meta+ArrowUp': 'moveToBeginningOfDocument:',
  'Meta+ArrowDown': 'moveToEndOfDocument:',
  'Meta+ArrowLeft': 'moveToLeftEndOfLine:',
  'Meta+ArrowRight': 'moveToRightEndOfLine:',
  'Shift+Meta+NumpadSubtract': 'cancel:',
  'Shift+Meta+Backspace': 'deleteToBeginningOfLine:',
  'Shift+Meta+ArrowUp': 'moveToBeginningOfDocumentAndModifySelection:',
  'Shift+Meta+ArrowDown': 'moveToEndOfDocumentAndModifySelection:',
  'Shift+Meta+ArrowLeft': 'moveToLeftEndOfLineAndModifySelection:',
  'Shift+Meta+ArrowRight': 'moveToRightEndOfLineAndModifySelection:',

  'Meta+KeyA': 'selectAll:',
  'Meta+KeyC': 'copy:',
  'Meta+KeyV': 'paste:',
};
