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

import * as fs from 'fs';
import * as actions from './recorder/recorderActions';
import type * as channels from '../../protocol/channels';
import { CodeGenerator, ActionInContext } from './recorder/codeGenerator';
import { describeFrame, toClickOptions, toModifiers } from './recorder/utils';
import { Page } from '../page';
import { Frame } from '../frames';
import { BrowserContext } from '../browserContext';
import { JavaLanguageGenerator } from './recorder/java';
import { JavaScriptLanguageGenerator } from './recorder/javascript';
import { CSharpLanguageGenerator } from './recorder/csharp';
import { PythonLanguageGenerator } from './recorder/python';
import * as recorderSource from '../../generated/recorderSource';
import * as consoleApiSource from '../../generated/consoleApiSource';
import { RecorderApp } from './recorder/recorderApp';
import { CallMetadata, internalCallMetadata, SdkObject } from '../instrumentation';
import { Point } from '../../common/types';
import { CallLog, CallLogStatus, EventData, Mode, Source, UIState } from './recorder/recorderTypes';
import { isUnderTest, monotonicTime } from '../../utils/utils';
import { InMemorySnapshotter } from '../snapshot/inMemorySnapshotter';
import { metadataToCallLog } from './recorder/recorderUtils';

type BindingSource = { frame: Frame, page: Page };

const symbol = Symbol('RecorderSupplement');

export class RecorderSupplement {
  private _generator: CodeGenerator;
  private _pageAliases = new Map<Page, string>();
  private _lastPopupOrdinal = 0;
  private _lastDialogOrdinal = 0;
  private _timers = new Set<NodeJS.Timeout>();
  private _context: BrowserContext;
  private _mode: Mode;
  private _highlightedSelector = '';
  private _recorderApp: RecorderApp | null = null;
  private _params: channels.BrowserContextRecorderSupplementEnableParams;
  private _currentCallsMetadata = new Map<CallMetadata, SdkObject>();
  private _pausedCallsMetadata = new Map<CallMetadata, () => void>();
  private _pauseOnNextStatement: boolean;
  private _recorderSources: Source[];
  private _userSources = new Map<string, Source>();
  private _snapshotter: InMemorySnapshotter;
  private _hoveredSnapshot: { callLogId: number, phase: 'before' | 'after' | 'action' } | undefined;
  private _snapshots = new Set<string>();
  private _allMetadatas = new Map<number, CallMetadata>();

  static getOrCreate(context: BrowserContext, params: channels.BrowserContextRecorderSupplementEnableParams = {}): Promise<RecorderSupplement> {
    let recorderPromise = (context as any)[symbol] as Promise<RecorderSupplement>;
    if (!recorderPromise) {
      const recorder = new RecorderSupplement(context, params);
      recorderPromise = recorder.install().then(() => recorder);
      (context as any)[symbol] = recorderPromise;
    }
    return recorderPromise;
  }

  static getNoCreate(context: BrowserContext): Promise<RecorderSupplement> | undefined {
    return (context as any)[symbol] as Promise<RecorderSupplement> | undefined;
  }

  constructor(context: BrowserContext, params: channels.BrowserContextRecorderSupplementEnableParams) {
    this._context = context;
    this._params = params;
    this._mode = params.startRecording ? 'recording' : 'none';
    this._pauseOnNextStatement = !!params.pauseOnNextStatement;
    const language = params.language || context._options.sdkLanguage;

    const languages = new Set([
      new JavaLanguageGenerator(),
      new JavaScriptLanguageGenerator(),
      new PythonLanguageGenerator(false),
      new PythonLanguageGenerator(true),
      new CSharpLanguageGenerator(),
    ]);
    const primaryLanguage = [...languages].find(l => l.id === language)!;
    if (!primaryLanguage)
      throw new Error(`\n===============================\nUnsupported language: '${language}'\n===============================\n`);

    languages.delete(primaryLanguage);
    const orderedLanguages = [primaryLanguage, ...languages];

    this._recorderSources = [];
    const generator = new CodeGenerator(context._browser.options.name, !!params.startRecording, params.launchOptions || {}, params.contextOptions || {}, params.device, params.saveStorage);
    let text = '';
    generator.on('change', () => {
      this._recorderSources = [];
      for (const languageGenerator of orderedLanguages) {
        const source: Source = {
          file: languageGenerator.fileName,
          text: generator.generateText(languageGenerator),
          language: languageGenerator.highlighter,
          highlight: []
        };
        source.revealLine = source.text.split('\n').length - 1;
        this._recorderSources.push(source);
        if (languageGenerator === orderedLanguages[0])
          text = source.text;
      }
      this._pushAllSources();
      this._recorderApp?.setFile(primaryLanguage.fileName);
    });
    if (params.outputFile) {
      context.on(BrowserContext.Events.BeforeClose, () => {
        fs.writeFileSync(params.outputFile!, text);
        text = '';
      });
      process.on('exit', () => {
        if (text)
          fs.writeFileSync(params.outputFile!, text);
      });
    }
    this._generator = generator;
    this._snapshotter = new InMemorySnapshotter(context);
  }

  async install() {
    const recorderApp = await RecorderApp.open(this._context);
    this._recorderApp = recorderApp;
    recorderApp.once('close', () => {
      this._snapshotter.dispose().catch(() => {});
      this._recorderApp = null;
    });
    recorderApp.on('event', (data: EventData) => {
      if (data.event === 'setMode') {
        this._setMode(data.params.mode);
        this._refreshOverlay();
        return;
      }
      if (data.event === 'selectorUpdated') {
        this._highlightedSelector = data.params.selector;
        this._refreshOverlay();
        return;
      }
      if (data.event === 'callLogHovered') {
        this._hoveredSnapshot = undefined;
        if (this._isPaused() && data.params.callLogId)
          this._hoveredSnapshot = data.params;
        this._refreshOverlay();
        return;
      }
      if (data.event === 'step') {
        this._resume(true);
        return;
      }
      if (data.event === 'resume') {
        this._resume(false);
        return;
      }
      if (data.event === 'pause') {
        this._pauseOnNextStatement = true;
        return;
      }
      if (data.event === 'clear') {
        this._clearScript();
        return;
      }
    });

    await Promise.all([
      recorderApp.setMode(this._mode),
      recorderApp.setPaused(!!this._pausedCallsMetadata.size),
      this._pushAllSources()
    ]);

    this._context.on(BrowserContext.Events.Page, page => this._onPage(page));
    for (const page of this._context.pages())
      this._onPage(page);

    this._context.once(BrowserContext.Events.Close, () => {
      for (const timer of this._timers)
        clearTimeout(timer);
      this._timers.clear();
      recorderApp.close().catch(() => {});
    });

    // Input actions that potentially lead to navigation are intercepted on the page and are
    // performed by the Playwright.
    await this._context.exposeBinding('_playwrightRecorderPerformAction', 'utility', false,
        (source: BindingSource, action: actions.Action) => this._performAction(source.frame, action));

    // Other non-essential actions are simply being recorded.
    await this._context.exposeBinding('_playwrightRecorderRecordAction', 'utility', false,
        (source: BindingSource, action: actions.Action) => this._recordAction(source.frame, action));

    // Commits last action so that no further signals are added to it.
    await this._context.exposeBinding('_playwrightRecorderCommitAction', 'utility', false,
        (source: BindingSource, action: actions.Action) => this._generator.commitLastAction());

    await this._context.exposeBinding('_playwrightRecorderState', 'utility', false, source => {
      let snapshotUrl: string | undefined;
      let actionSelector = this._highlightedSelector;
      let actionPoint: Point | undefined;
      if (this._hoveredSnapshot) {
        const metadata = this._allMetadatas.get(this._hoveredSnapshot.callLogId)!;
        snapshotUrl = `${metadata.pageId}?name=${this._hoveredSnapshot.phase}@${this._hoveredSnapshot.callLogId}`;
        actionPoint = this._hoveredSnapshot.phase === 'action' ? metadata?.point : undefined;
      } else {
        for (const [metadata, sdkObject] of this._currentCallsMetadata) {
          if (source.page === sdkObject.attribution.page) {
            actionPoint = metadata.point || actionPoint;
            actionSelector = actionSelector || metadata.params.selector;
          }
        }
      }
      const uiState: UIState = {
        mode: this._mode,
        actionPoint,
        actionSelector,
        snapshotUrl,
      };
      return uiState;
    });

    await this._context.exposeBinding('_playwrightRecorderSetSelector', 'utility', false, async (_, selector: string) => {
      this._setMode('none');
      await this._recorderApp?.setSelector(selector, true);
      await this._recorderApp?.bringToFront();
    });

    await this._context.exposeBinding('_playwrightResume', 'utility', false, () => {
      this._resume(false).catch(() => {});
    });

    const snapshotBaseUrl = await this._snapshotter.initialize() + '/snapshot/';
    await this._context.extendInjectedScript(recorderSource.source, { isUnderTest: isUnderTest(), snapshotBaseUrl });
    await this._context.extendInjectedScript(consoleApiSource.source);
    (this._context as any).recorderAppForTest = recorderApp;
  }

  async pause(metadata: CallMetadata) {
    const result = new Promise<void>(f => {
      this._pausedCallsMetadata.set(metadata, f);
    });
    this._recorderApp!.setPaused(true);
    metadata.pauseStartTime = monotonicTime();
    this._updateUserSources();
    this.updateCallLog([metadata]);
    return result;
  }

  _isPaused(): boolean {
    return !!this._pausedCallsMetadata.size;
  }

  private _setMode(mode: Mode) {
    this._mode = mode;
    this._recorderApp?.setMode(this._mode);
    this._generator.setEnabled(this._mode === 'recording');
    if (this._mode !== 'none')
      this._context.pages()[0].bringToFront().catch(() => {});
  }

  private async _resume(step: boolean) {
    this._pauseOnNextStatement = step;
    this._recorderApp?.setPaused(false);

    const endTime = monotonicTime();
    for (const [metadata, callback] of this._pausedCallsMetadata) {
      metadata.pauseEndTime = endTime;
      callback();
    }
    this._pausedCallsMetadata.clear();

    this._updateUserSources();
    this.updateCallLog([...this._currentCallsMetadata.keys()]);
  }

  private _refreshOverlay() {
    for (const page of this._context.pages())
      page.mainFrame().evaluateExpression('window._playwrightRefreshOverlay()', false, undefined, 'utility').catch(() => {});
  }

  private async _onPage(page: Page) {
    // First page is called page, others are called popup1, popup2, etc.
    const frame = page.mainFrame();
    page.on('close', () => {
      this._pageAliases.delete(page);
      this._generator.addAction({
        pageAlias,
        ...describeFrame(page.mainFrame()),
        committed: true,
        action: {
          name: 'closePage',
          signals: [],
        }
      });
    });
    frame.on(Frame.Events.Navigation, () => this._onFrameNavigated(frame, page));
    page.on(Page.Events.Download, () => this._onDownload(page));
    page.on(Page.Events.Dialog, () => this._onDialog(page));
    const suffix = this._pageAliases.size ? String(++this._lastPopupOrdinal) : '';
    const pageAlias = 'page' + suffix;
    this._pageAliases.set(page, pageAlias);

    if (page.opener()) {
      this._onPopup(page.opener()!, page);
    } else {
      this._generator.addAction({
        pageAlias,
        ...describeFrame(page.mainFrame()),
        committed: true,
        action: {
          name: 'openPage',
          url: page.mainFrame().url(),
          signals: [],
        }
      });
    }
  }

  private _clearScript(): void {
    this._generator.restart();
    if (!!this._params.startRecording) {
      for (const page of this._context.pages())
        this._onFrameNavigated(page.mainFrame(), page);
    }
  }

  private async _performAction(frame: Frame, action: actions.Action) {
    const page = frame._page;
    const actionInContext: ActionInContext = {
      pageAlias: this._pageAliases.get(page)!,
      ...describeFrame(frame),
      action
    };
    this._generator.willPerformAction(actionInContext);
    const noCallMetadata = internalCallMetadata();
    try {
      const kActionTimeout = 5000;
      if (action.name === 'click') {
        const { options } = toClickOptions(action);
        await frame.click(noCallMetadata, action.selector, { ...options, timeout: kActionTimeout });
      }
      if (action.name === 'press') {
        const modifiers = toModifiers(action.modifiers);
        const shortcut = [...modifiers, action.key].join('+');
        await frame.press(noCallMetadata, action.selector, shortcut, { timeout: kActionTimeout });
      }
      if (action.name === 'check')
        await frame.check(noCallMetadata, action.selector, { timeout: kActionTimeout });
      if (action.name === 'uncheck')
        await frame.uncheck(noCallMetadata, action.selector, { timeout: kActionTimeout });
      if (action.name === 'select')
        await frame.selectOption(noCallMetadata, action.selector, [], action.options.map(value => ({ value })), { timeout: kActionTimeout });
    } catch (e) {
      this._generator.performedActionFailed(actionInContext);
      return;
    }
    const timer = setTimeout(() => {
      actionInContext.committed = true;
      this._timers.delete(timer);
    }, 5000);
    this._generator.didPerformAction(actionInContext);
    this._timers.add(timer);
  }

  private async _recordAction(frame: Frame, action: actions.Action) {
    this._generator.addAction({
      pageAlias: this._pageAliases.get(frame._page)!,
      ...describeFrame(frame),
      action
    });
  }

  private _onFrameNavigated(frame: Frame, page: Page) {
    const pageAlias = this._pageAliases.get(page);
    this._generator.signal(pageAlias!, frame, { name: 'navigation', url: frame.url() });
  }

  private _onPopup(page: Page, popup: Page) {
    const pageAlias = this._pageAliases.get(page)!;
    const popupAlias = this._pageAliases.get(popup)!;
    this._generator.signal(pageAlias, page.mainFrame(), { name: 'popup', popupAlias });
  }
  private _onDownload(page: Page) {
    const pageAlias = this._pageAliases.get(page)!;
    this._generator.signal(pageAlias, page.mainFrame(), { name: 'download' });
  }

  private _onDialog(page: Page) {
    const pageAlias = this._pageAliases.get(page)!;
    this._generator.signal(pageAlias, page.mainFrame(), { name: 'dialog', dialogAlias: String(++this._lastDialogOrdinal) });
  }

  _captureSnapshot(sdkObject: SdkObject, metadata: CallMetadata, phase: 'before' | 'after' | 'action') {
    if (sdkObject.attribution.page) {
      const snapshotName = `${phase}@${metadata.id}`;
      this._snapshots.add(snapshotName);
      this._snapshotter.captureSnapshot(sdkObject.attribution.page, snapshotName);
    }
  }

  async onBeforeCall(sdkObject: SdkObject, metadata: CallMetadata): Promise<void> {
    if (this._mode === 'recording')
      return;
    this._captureSnapshot(sdkObject, metadata, 'before');
    this._currentCallsMetadata.set(metadata, sdkObject);
    this._allMetadatas.set(metadata.id, metadata);
    this._updateUserSources();
    this.updateCallLog([metadata]);
    if (shouldPauseOnCall(sdkObject, metadata) || (this._pauseOnNextStatement && shouldPauseOnStep(sdkObject, metadata)))
      await this.pause(metadata);
    if (metadata.params && metadata.params.selector) {
      this._highlightedSelector = metadata.params.selector;
      await this._recorderApp?.setSelector(this._highlightedSelector);
    }
  }

  async onAfterCall(sdkObject: SdkObject, metadata: CallMetadata): Promise<void> {
    if (this._mode === 'recording')
      return;
    this._captureSnapshot(sdkObject, metadata, 'after');
    if (!metadata.error)
      this._currentCallsMetadata.delete(metadata);
    this._pausedCallsMetadata.delete(metadata);
    this._updateUserSources();
    this.updateCallLog([metadata]);
  }

  private _updateUserSources() {
    // Remove old decorations.
    for (const source of this._userSources.values()) {
      source.highlight = [];
      source.revealLine = undefined;
    }

    // Apply new decorations.
    let fileToSelect = undefined;
    for (const metadata of this._currentCallsMetadata.keys()) {
      if (!metadata.stack || !metadata.stack[0])
        continue;
      const { file, line } = metadata.stack[0];
      let source = this._userSources.get(file);
      if (!source) {
        source = { file, text: this._readSource(file), highlight: [], language: languageForFile(file) };
        this._userSources.set(file, source);
      }
      if (line) {
        const paused = this._pausedCallsMetadata.has(metadata);
        source.highlight.push({ line, type: metadata.error ? 'error' : (paused ? 'paused' : 'running') });
        source.revealLine = line;
        fileToSelect = source.file;
      }
    }
    this._pushAllSources();
    if (fileToSelect)
      this._recorderApp?.setFile(fileToSelect);
  }

  private _pushAllSources() {
    this._recorderApp?.setSources([...this._recorderSources, ...this._userSources.values()]);
  }

  async onBeforeInputAction(sdkObject: SdkObject, metadata: CallMetadata): Promise<void> {
    if (this._mode === 'recording')
      return;
    this._captureSnapshot(sdkObject, metadata, 'action');
    if (this._pauseOnNextStatement)
      await this.pause(metadata);
  }

  updateCallLog(metadatas: CallMetadata[]) {
    if (this._mode === 'recording')
      return;
    const logs: CallLog[] = [];
    for (const metadata of metadatas) {
      if (!metadata.method)
        continue;
      let status: CallLogStatus = 'done';
      if (this._currentCallsMetadata.has(metadata))
        status = 'in-progress';
      if (this._pausedCallsMetadata.has(metadata))
        status = 'paused';
      logs.push(metadataToCallLog(metadata, status, this._snapshots));
    }
    this._recorderApp?.updateCallLogs(logs);
  }

  private _readSource(fileName: string): string {
    try {
      return fs.readFileSync(fileName, 'utf-8');
    } catch (e) {
      return '// No source available';
    }
  }
}

function languageForFile(file: string) {
  if (file.endsWith('.py'))
    return 'python';
  if (file.endsWith('.java'))
    return 'java';
  if (file.endsWith('.cs'))
    return 'csharp';
  return 'javascript';
}

function shouldPauseOnCall(sdkObject: SdkObject, metadata: CallMetadata): boolean {
  if (!sdkObject.attribution.browser?.options.headful && !isUnderTest())
    return false;
  return metadata.method === 'pause';
}

function shouldPauseOnStep(sdkObject: SdkObject, metadata: CallMetadata): boolean {
  return metadata.method === 'goto' || metadata.method === 'close';
}
