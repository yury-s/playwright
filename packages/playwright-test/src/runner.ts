/**
 * Copyright 2019 Google Inc. All rights reserved.
 * Modifications copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { rimraf, minimatch } from 'playwright-core/lib/utilsBundle';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import type { TestGroup } from './dispatcher';
import { Dispatcher } from './dispatcher';
import type { TestFileFilter } from './util';
import { createFileMatcher, createTitleMatcher, serializeError } from './util';
import type { TestCase } from './test';
import { Suite } from './test';
import { Loader } from './loader';
import type { FullResult, Reporter, TestError } from '../types/testReporter';
import { Multiplexer } from './reporters/multiplexer';
import { formatError } from './reporters/base';
import { colors } from 'playwright-core/lib/utilsBundle';
import DotReporter from './reporters/dot';
import GitHubReporter from './reporters/github';
import LineReporter from './reporters/line';
import ListReporter from './reporters/list';
import JSONReporter from './reporters/json';
import JUnitReporter from './reporters/junit';
import EmptyReporter from './reporters/empty';
import HtmlReporter from './reporters/html';
import type { Config, FullProjectInternal, ReporterInternal } from './types';
import type { FullConfigInternal } from './types';
import { raceAgainstTimeout } from 'playwright-core/lib/utils/timeoutRunner';
import { SigIntWatcher } from './sigIntWatcher';
import type { TestRunnerPlugin } from './plugins';
import { setRunnerToAddPluginsTo } from './plugins';
import { webServerPluginsForConfig } from './plugins/webServerPlugin';
import { dockerPlugin } from './docker/docker';
import { MultiMap } from 'playwright-core/lib/utils/multimap';

const removeFolderAsync = promisify(rimraf);
const readDirAsync = promisify(fs.readdir);
const readFileAsync = promisify(fs.readFile);
export const kDefaultConfigFiles = ['playwright.config.ts', 'playwright.config.js', 'playwright.config.mjs'];

type RunOptions = {
  listOnly?: boolean;
  testFileFilters?: TestFileFilter[];
  projectFilter?: string[];
  watchMode?: boolean;
  passWithNoTests?: boolean;
};

export type ConfigCLIOverrides = {
  forbidOnly?: boolean;
  fullyParallel?: boolean;
  globalTimeout?: number;
  grep?: RegExp;
  grepInvert?: RegExp;
  maxFailures?: number;
  outputDir?: string;
  quiet?: boolean;
  repeatEach?: number;
  retries?: number;
  reporter?: string;
  shard?: { current: number, total: number };
  timeout?: number;
  ignoreSnapshots?: boolean;
  updateSnapshots?: 'all'|'none'|'missing';
  workers?: number;
  projects?: { name: string, use?: any }[],
  use?: any;
};

type WatchProgress = {
  canceled: boolean;
  dispatcher: Dispatcher | undefined;
};

export class Runner {
  private _loader: Loader;
  private _reporter!: ReporterInternal;
  private _plugins: TestRunnerPlugin[] = [];
  private _watchRepeatEachIndex = 0;
  private _watchJobsQueue = Promise.resolve();

  constructor(configCLIOverrides?: ConfigCLIOverrides) {
    this._loader = new Loader(configCLIOverrides);
    setRunnerToAddPluginsTo(this);
  }

  addPlugin(plugin: TestRunnerPlugin) {
    this._plugins.push(plugin);
  }

  async loadConfigFromResolvedFile(resolvedConfigFile: string): Promise<FullConfigInternal> {
    return await this._loader.loadConfigFile(resolvedConfigFile);
  }

  loadEmptyConfig(configFileOrDirectory: string): Promise<Config> {
    return this._loader.loadEmptyConfig(configFileOrDirectory);
  }

  static resolveConfigFile(configFileOrDirectory: string): string | null {
    const resolveConfig = (configFile: string) => {
      if (fs.existsSync(configFile))
        return configFile;
    };

    const resolveConfigFileFromDirectory = (directory: string) => {
      for (const configName of kDefaultConfigFiles) {
        const configFile = resolveConfig(path.resolve(directory, configName));
        if (configFile)
          return configFile;
      }
    };

    if (!fs.existsSync(configFileOrDirectory))
      throw new Error(`${configFileOrDirectory} does not exist`);
    if (fs.statSync(configFileOrDirectory).isDirectory()) {
      // When passed a directory, look for a config file inside.
      const configFile = resolveConfigFileFromDirectory(configFileOrDirectory);
      if (configFile)
        return configFile;
      // If there is no config, assume this as a root testing directory.
      return null;
    } else {
      // When passed a file, it must be a config file.
      const configFile = resolveConfig(configFileOrDirectory);
      return configFile!;
    }
  }

  private async _createReporter(list: boolean) {
    const defaultReporters: {[key in BuiltInReporter]: new(arg: any) => Reporter} = {
      dot: list ? ListModeReporter : DotReporter,
      line: list ? ListModeReporter : LineReporter,
      list: list ? ListModeReporter : ListReporter,
      github: GitHubReporter,
      json: JSONReporter,
      junit: JUnitReporter,
      null: EmptyReporter,
      html: HtmlReporter,
    };
    const reporters: Reporter[] = [];
    for (const r of this._loader.fullConfig().reporter) {
      const [name, arg] = r;
      if (name in defaultReporters) {
        reporters.push(new defaultReporters[name as keyof typeof defaultReporters](arg));
      } else {
        const reporterConstructor = await this._loader.loadReporter(name);
        reporters.push(new reporterConstructor(arg));
      }
    }
    if (process.env.PW_TEST_REPORTER) {
      const reporterConstructor = await this._loader.loadReporter(process.env.PW_TEST_REPORTER);
      reporters.push(new reporterConstructor());
    }

    const someReporterPrintsToStdio = reporters.some(r => {
      const prints = r.printsToStdio ? r.printsToStdio() : true;
      return prints;
    });
    if (reporters.length && !someReporterPrintsToStdio) {
      // Add a line/dot/list-mode reporter for convenience.
      // Important to put it first, jsut in case some other reporter stalls onEnd.
      if (list)
        reporters.unshift(new ListModeReporter());
      else
        reporters.unshift(!process.env.CI ? new LineReporter({ omitFailures: true }) : new DotReporter());
    }
    return new Multiplexer(reporters);
  }

  async runAllTests(options: RunOptions = {}): Promise<FullResult> {
    this._reporter = await this._createReporter(!!options.listOnly);
    const config = this._loader.fullConfig();
    if (options.watchMode) {
      config._watchMode = true;
      config._workerIsolation = 'isolate-projects';
      return await this._watch(options);
    }

    const result = await raceAgainstTimeout(() => this._run(options), config.globalTimeout);
    let fullResult: FullResult;
    if (result.timedOut) {
      this._reporter.onError?.(createStacklessError(`Timed out waiting ${config.globalTimeout / 1000}s for the entire test run`));
      fullResult = { status: 'timedout' };
    } else {
      fullResult = result.result;
    }
    await this._reporter.onEnd?.(fullResult);

    // Calling process.exit() might truncate large stdout/stderr output.
    // See https://github.com/nodejs/node/issues/6456.
    // See https://github.com/nodejs/node/issues/12921
    await new Promise<void>(resolve => process.stdout.write('', () => resolve()));
    await new Promise<void>(resolve => process.stderr.write('', () => resolve()));

    await this._reporter._onExit?.();
    return fullResult;
  }

  async listTestFiles(configFile: string, projectNames: string[] | undefined): Promise<any> {
    const filesByProject = await this._collectFiles([], projectNames);
    const report: any = {
      projects: []
    };
    for (const [project, files] of filesByProject) {
      report.projects.push({
        name: project.name,
        testDir: path.resolve(configFile, project.testDir),
        files: files
      });
    }
    return report;
  }

  private async _collectFiles(testFileFilters: TestFileFilter[], projectNames?: string[]): Promise<Map<FullProjectInternal, string[]>> {
    const testFileFilter = testFileFilters.length ? createFileMatcher(testFileFilters.map(e => e.re || e.exact || '')) : () => true;
    let projectsToFind: Set<string> | undefined;
    let unknownProjects: Map<string, string> | undefined;
    if (projectNames) {
      projectsToFind = new Set();
      unknownProjects = new Map();
      projectNames.forEach(n => {
        const name = n.toLocaleLowerCase();
        projectsToFind!.add(name);
        unknownProjects!.set(name, n);
      });
    }
    const fullConfig = this._loader.fullConfig();
    const projects = fullConfig.projects.filter(project => {
      if (!projectsToFind)
        return true;
      const name = project.name.toLocaleLowerCase();
      unknownProjects!.delete(name);
      return projectsToFind.has(name);
    });
    if (unknownProjects && unknownProjects.size) {
      const names = fullConfig.projects.map(p => p.name).filter(name => !!name);
      if (!names.length)
        throw new Error(`No named projects are specified in the configuration file`);
      const unknownProjectNames = Array.from(unknownProjects.values()).map(n => `"${n}"`).join(', ');
      throw new Error(`Project(s) ${unknownProjectNames} not found. Available named projects: ${names.map(name => `"${name}"`).join(', ')}`);
    }

    const files = new Map<FullProjectInternal, string[]>();
    for (const project of projects) {
      const allFiles = await collectFiles(project.testDir, project._respectGitIgnore);
      const testMatch = createFileMatcher(project.testMatch);
      const testIgnore = createFileMatcher(project.testIgnore);
      const extensions = ['.js', '.ts', '.mjs', '.tsx', '.jsx', '.feature'];
      const testFileExtension = (file: string) => extensions.includes(path.extname(file));
      const testFiles = allFiles.filter(file => !testIgnore(file) && testMatch(file) && testFileFilter(file) && testFileExtension(file));
      files.set(project, testFiles);
    }
    return files;
  }

  private async _run(options: RunOptions): Promise<FullResult> {
    const testFileFilters = options.testFileFilters || [];
    const filesByProject = await this._collectFiles(testFileFilters, options.projectFilter);

    const allTestFiles = new Set<string>();
    for (const files of filesByProject.values())
      files.forEach(file => allTestFiles.add(file));

    const config = this._loader.fullConfig();

    const fatalErrors: TestError[] = [];

    // 1. Add all tests.
    const preprocessRoot = new Suite('', 'root');
    for (const file of allTestFiles) {
      const fileSuite = await this._loader.loadTestFile(file, 'runner');
      if (fileSuite._loadError)
        fatalErrors.push(fileSuite._loadError);
      preprocessRoot._addSuite(fileSuite);
    }

    // 2. Complain about duplicate titles.
    const duplicateTitlesError = createDuplicateTitlesError(config, preprocessRoot);
    if (duplicateTitlesError)
      fatalErrors.push(duplicateTitlesError);

    // 3. Filter tests to respect line/column filter.
    filterByFocusedLine(preprocessRoot, testFileFilters);

    // 4. Complain about only.
    if (config.forbidOnly) {
      const onlyTestsAndSuites = preprocessRoot._getOnlyItems();
      if (onlyTestsAndSuites.length > 0)
        fatalErrors.push(createForbidOnlyError(config, onlyTestsAndSuites));
    }

    // 5. Filter only.
    if (!options.listOnly)
      filterOnly(preprocessRoot);

    // 6. Generate projects.
    const fileSuites = new Map<string, Suite>();
    for (const fileSuite of preprocessRoot.suites)
      fileSuites.set(fileSuite._requireFile, fileSuite);

    const rootSuite = new Suite('', 'root');
    for (const [project, files] of filesByProject) {
      const grepMatcher = createTitleMatcher(project.grep);
      const grepInvertMatcher = project.grepInvert ? createTitleMatcher(project.grepInvert) : null;
      const projectSuite = new Suite(project.name, 'project');
      projectSuite._projectConfig = project;
      if (project._fullyParallel)
        projectSuite._parallelMode = 'parallel';
      rootSuite._addSuite(projectSuite);
      for (const file of files) {
        const fileSuite = fileSuites.get(file);
        if (!fileSuite)
          continue;
        for (let repeatEachIndex = 0; repeatEachIndex < project.repeatEach; repeatEachIndex++) {
          const builtSuite = this._loader.buildFileSuiteForProject(project, fileSuite, repeatEachIndex, test => {
            const grepTitle = test.titlePath().join(' ');
            if (grepInvertMatcher?.(grepTitle))
              return false;
            return grepMatcher(grepTitle);
          });
          if (builtSuite)
            projectSuite._addSuite(builtSuite);
        }
      }
    }

    // 7. Fail when no tests.
    let total = rootSuite.allTests().length;
    if (!total && !options.passWithNoTests)
      fatalErrors.push(createNoTestsError());

    // 8. Compute shards.
    let testGroups = createTestGroups(rootSuite, config.workers);

    const shard = config.shard;
    if (shard) {
      const shardGroups: TestGroup[] = [];
      const shardTests = new Set<TestCase>();

      // Each shard gets some tests.
      const shardSize = Math.floor(total / shard.total);
      // First few shards get one more test each.
      const extraOne = total - shardSize * shard.total;

      const currentShard = shard.current - 1; // Make it zero-based for calculations.
      const from = shardSize * currentShard + Math.min(extraOne, currentShard);
      const to = from + shardSize + (currentShard < extraOne ? 1 : 0);
      let current = 0;
      for (const group of testGroups) {
        // Any test group goes to the shard that contains the first test of this group.
        // So, this shard gets any group that starts at [from; to)
        if (current >= from && current < to) {
          shardGroups.push(group);
          for (const test of group.tests)
            shardTests.add(test);
        }
        current += group.tests.length;
      }

      testGroups = shardGroups;
      filterSuiteWithOnlySemantics(rootSuite, () => false, test => shardTests.has(test));
      total = rootSuite.allTests().length;
    }
    config._testGroupsCount = testGroups.length;

    // 9. Report begin
    this._reporter.onBegin?.(config, rootSuite);

    // 10. Bail out on errors prior to running global setup.
    if (fatalErrors.length) {
      for (const error of fatalErrors)
        this._reporter.onError?.(error);
      return { status: 'failed' };
    }

    // 11. Bail out if list mode only, don't do any work.
    if (options.listOnly)
      return { status: 'passed' };

    // 12. Remove output directores.
    if (!this._removeOutputDirs(options))
      return { status: 'failed' };

    // 13. Run Global setup.
    const result: FullResult = { status: 'passed' };
    const globalTearDown = await this._performGlobalSetup(config, rootSuite, [...filesByProject.keys()], result);
    if (result.status !== 'passed')
      return result;

    if (config._ignoreSnapshots) {
      this._reporter.onStdOut?.(colors.dim([
        'NOTE: running with "ignoreSnapshots" option. All of the following asserts are silently ignored:',
        '- expect().toMatchSnapshot()',
        '- expect().toHaveScreenshot()',
        '',
      ].join('\n')));
    }

    // 14. Run tests.
    try {
      const sigintWatcher = new SigIntWatcher();

      let hasWorkerErrors = false;
      const dispatcher = new Dispatcher(this._loader, testGroups, this._reporter);
      await Promise.race([dispatcher.run(), sigintWatcher.promise()]);
      if (!sigintWatcher.hadSignal()) {
        // We know for sure there was no Ctrl+C, so we remove custom SIGINT handler
        // as soon as we can.
        sigintWatcher.disarm();
      }
      await dispatcher.stop();
      hasWorkerErrors = dispatcher.hasWorkerErrors();

      if (!sigintWatcher.hadSignal()) {
        const failed = hasWorkerErrors || rootSuite.allTests().some(test => !test.ok());
        result.status = failed ? 'failed' : 'passed';
      } else {
        result.status = 'interrupted';
      }
    } catch (e) {
      this._reporter.onError?.(serializeError(e));
      return { status: 'failed' };
    } finally {
      await globalTearDown?.();
    }
    return result;
  }

  private async _watch(options: RunOptions): Promise<FullResult> {
    const config = this._loader.fullConfig();

    // 1. Create empty suite.
    const rootSuite = new Suite('', 'root');

    // 2. Report begin.
    this._reporter.onBegin?.(config, rootSuite);

    // 3. Remove output directores.
    if (!this._removeOutputDirs(options))
      return { status: 'failed' };

    // 4. Run Global setup.
    const result: FullResult = { status: 'passed' };
    const globalTearDown = await this._performGlobalSetup(config, rootSuite, config.projects.filter(p => !options.projectFilter || options.projectFilter.includes(p.name)), result);
    if (result.status !== 'passed')
      return result;

    const progress: WatchProgress = { canceled: false, dispatcher: undefined };

    const runAndWatch = async () => {
      // 5. Collect all files.
      const testFileFilters = options.testFileFilters || [];
      const filesByProject = await this._collectFiles(testFileFilters, options.projectFilter);

      const allTestFiles = new Set<string>();
      for (const files of filesByProject.values())
        files.forEach(file => allTestFiles.add(file));

      // 6. Trigger 'all files changed'.
      await this._runAndReportError(async () => {
        await this._runModifiedTestFilesForWatch(progress, options, allTestFiles);
      }, result);

      // 7. Start watching the filesystem for modifications.
      await this._watchTestFiles(progress, options);
    };

    try {
      const sigintWatcher = new SigIntWatcher();
      await Promise.race([runAndWatch(), sigintWatcher.promise()]);
      if (!sigintWatcher.hadSignal())
        sigintWatcher.disarm();
      progress.canceled = true;
      await progress.dispatcher?.stop();
    } finally {
      await globalTearDown?.();
    }
    return result;
  }

  private async _runModifiedTestFilesForWatch(progress: WatchProgress, options: RunOptions, testFiles: Set<string>): Promise<void> {
    if (progress.canceled)
      return;

    const testFileFilters: TestFileFilter[] = [...testFiles].map(f => ({
      exact: f,
      line: null,
      column: null,
    }));
    const filesByProject = await this._collectFiles(testFileFilters, options.projectFilter);

    if (progress.canceled)
      return;

    const testGroups: TestGroup[] = [];
    const repeatEachIndex = ++this._watchRepeatEachIndex;
    for (const [project, files] of filesByProject) {
      for (const file of files) {
        const group: TestGroup = {
          workerHash: `run${project.id}-repeat${repeatEachIndex}`,
          requireFile: file,
          repeatEachIndex,
          projectId: project.id,
          tests: [],
          watchMode: true,
        };
        testGroups.push(group);
      }
    }

    const dispatcher = new Dispatcher(this._loader, testGroups, this._reporter);
    progress.dispatcher = dispatcher;
    await dispatcher.run();
    await dispatcher.stop();
    progress.dispatcher = undefined;
  }

  private async _watchTestFiles(progress: WatchProgress, options: RunOptions): Promise<void> {
    const folders = new Set<string>();
    const config = this._loader.fullConfig();
    for (const project of config.projects) {
      if (options.projectFilter && !options.projectFilter.includes(project.name))
        continue;
      folders.add(project.testDir);
    }

    for (const folder of folders) {
      const changedFiles = new Set<string>();
      let throttleTimer: NodeJS.Timeout | undefined;
      fs.watch(folder, (event, filename) => {
        if (event !== 'change')
          return;

        const fullName = path.join(folder, filename);
        changedFiles.add(fullName);
        if (throttleTimer)
          clearTimeout(throttleTimer);

        throttleTimer = setTimeout(() => {
          const copy = new Set(changedFiles);
          changedFiles.clear();
          this._watchJobsQueue = this._watchJobsQueue.then(() => this._runModifiedTestFilesForWatch(progress, options, copy));
        }, 250);
      });
    }

    await new Promise(() => {});
  }

  private async _removeOutputDirs(options: RunOptions): Promise<boolean> {
    const config = this._loader.fullConfig();
    const outputDirs = new Set<string>();
    for (const p of config.projects) {
      if (!options.projectFilter || options.projectFilter.includes(p.name))
        outputDirs.add(p.outputDir);
    }

    try {
      await Promise.all(Array.from(outputDirs).map(outputDir => removeFolderAsync(outputDir).catch(async (error: any) => {
        if ((error as any).code === 'EBUSY') {
          // We failed to remove folder, might be due to the whole folder being mounted inside a container:
          //   https://github.com/microsoft/playwright/issues/12106
          // Do a best-effort to remove all files inside of it instead.
          const entries = await readDirAsync(outputDir).catch(e => []);
          await Promise.all(entries.map(entry => removeFolderAsync(path.join(outputDir, entry))));
        } else {
          throw error;
        }
      })));
    } catch (e) {
      this._reporter.onError?.(serializeError(e));
      return false;
    }
    return true;
  }

  private async _performGlobalSetup(config: FullConfigInternal, rootSuite: Suite, projects: FullProjectInternal[], result: FullResult): Promise<(() => Promise<void>) | undefined> {
    let globalSetupResult: any = undefined;

    const pluginsThatWereSetUp: TestRunnerPlugin[] = [];
    const sigintWatcher = new SigIntWatcher();

    const tearDown = async () => {
      await this._runAndReportError(async () => {
        if (globalSetupResult && typeof globalSetupResult === 'function')
          await globalSetupResult(this._loader.fullConfig());
      }, result);

      await this._runAndReportError(async () => {
        if (globalSetupResult && config.globalTeardown)
          await (await this._loader.loadGlobalHook(config.globalTeardown))(this._loader.fullConfig());
      }, result);

      for (const plugin of pluginsThatWereSetUp.reverse()) {
        await this._runAndReportError(async () => {
          await plugin.teardown?.();
        }, result);
      }
    };

    // Legacy webServer support.
    this._plugins.push(...webServerPluginsForConfig(config));

    // Docker support.
    this._plugins.push(dockerPlugin);

    await this._runAndReportError(async () => {
      // First run the plugins, if plugin is a web server we want it to run before the
      // config's global setup.
      for (const plugin of this._plugins) {
        await Promise.race([
          plugin.setup?.(config, config._configDir, rootSuite, this._reporter),
          sigintWatcher.promise(),
        ]);
        if (sigintWatcher.hadSignal())
          break;
        pluginsThatWereSetUp.push(plugin);
      }

      // Then do global setup.
      if (!sigintWatcher.hadSignal()) {
        if (config.globalSetup) {
          const hook = await this._loader.loadGlobalHook(config.globalSetup);
          await Promise.race([
            Promise.resolve().then(() => hook(this._loader.fullConfig())).then((r: any) => globalSetupResult = r || '<noop>'),
            sigintWatcher.promise(),
          ]);
        } else {
          // Make sure we run the teardown.
          globalSetupResult = '<noop>';
        }
      }
    }, result);

    sigintWatcher.disarm();

    if (result.status !== 'passed' || sigintWatcher.hadSignal()) {
      await tearDown();
      result.status = sigintWatcher.hadSignal() ? 'interrupted' : 'failed';
      return;
    }

    return tearDown;
  }

  private async _runAndReportError(callback: () => Promise<void>, result: FullResult) {
    try {
      await callback();
    } catch (e) {
      result.status = 'failed';
      this._reporter.onError?.(serializeError(e));
    }
  }
}

function filterOnly(suite: Suite) {
  const suiteFilter = (suite: Suite) => suite._only;
  const testFilter = (test: TestCase) => test._only;
  return filterSuiteWithOnlySemantics(suite, suiteFilter, testFilter);
}

function filterByFocusedLine(suite: Suite, focusedTestFileLines: TestFileFilter[]) {
  const filterWithLine = !!focusedTestFileLines.find(f => f.line !== null);
  if (!filterWithLine)
    return;

  const testFileLineMatches = (testFileName: string, testLine: number, testColumn: number) => focusedTestFileLines.some(({ re, exact, line, column }) => {
    const lineColumnOk = (line === testLine || line === null) && (column === testColumn || column === null);
    if (!lineColumnOk)
      return false;
    if (re) {
      re.lastIndex = 0;
      return re.test(testFileName);
    }
    return testFileName === exact;
  });
  const suiteFilter = (suite: Suite) => {
    return !!suite.location && testFileLineMatches(suite.location.file, suite.location.line, suite.location.column);
  };
  const testFilter = (test: TestCase) => testFileLineMatches(test.location.file, test.location.line, test.location.column);
  return filterSuite(suite, suiteFilter, testFilter);
}

function filterSuiteWithOnlySemantics(suite: Suite, suiteFilter: (suites: Suite) => boolean, testFilter: (test: TestCase) => boolean) {
  const onlySuites = suite.suites.filter(child => filterSuiteWithOnlySemantics(child, suiteFilter, testFilter) || suiteFilter(child));
  const onlyTests = suite.tests.filter(testFilter);
  const onlyEntries = new Set([...onlySuites, ...onlyTests]);
  if (onlyEntries.size) {
    suite.suites = onlySuites;
    suite.tests = onlyTests;
    suite._entries = suite._entries.filter(e => onlyEntries.has(e)); // Preserve the order.
    return true;
  }
  return false;
}

function filterSuite(suite: Suite, suiteFilter: (suites: Suite) => boolean, testFilter: (test: TestCase) => boolean) {
  for (const child of suite.suites) {
    if (!suiteFilter(child))
      filterSuite(child, suiteFilter, testFilter);
  }
  suite.tests = suite.tests.filter(testFilter);
  const entries = new Set([...suite.suites, ...suite.tests]);
  suite._entries = suite._entries.filter(e => entries.has(e)); // Preserve the order.
}

async function collectFiles(testDir: string, respectGitIgnore: boolean): Promise<string[]> {
  if (!fs.existsSync(testDir))
    return [];
  if (!fs.statSync(testDir).isDirectory())
    return [];

  type Rule = {
    dir: string;
    negate: boolean;
    match: (s: string, partial?: boolean) => boolean
  };
  type IgnoreStatus = 'ignored' | 'included' | 'ignored-but-recurse';

  const checkIgnores = (entryPath: string, rules: Rule[], isDirectory: boolean, parentStatus: IgnoreStatus) => {
    let status = parentStatus;
    for (const rule of rules) {
      const ruleIncludes = rule.negate;
      if ((status === 'included') === ruleIncludes)
        continue;
      const relative = path.relative(rule.dir, entryPath);
      if (rule.match('/' + relative) || rule.match(relative)) {
        // Matches "/dir/file" or "dir/file"
        status = ruleIncludes ? 'included' : 'ignored';
      } else if (isDirectory && (rule.match('/' + relative + '/') || rule.match(relative + '/'))) {
        // Matches "/dir/subdir/" or "dir/subdir/" for directories.
        status = ruleIncludes ? 'included' : 'ignored';
      } else if (isDirectory && ruleIncludes && (rule.match('/' + relative, true) || rule.match(relative, true))) {
        // Matches "/dir/donotskip/" when "/dir" is excluded, but "!/dir/donotskip/file" is included.
        status = 'ignored-but-recurse';
      }
    }
    return status;
  };

  const files: string[] = [];

  const visit = async (dir: string, rules: Rule[], status: IgnoreStatus) => {
    const entries = await readDirAsync(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    if (respectGitIgnore) {
      const gitignore = entries.find(e => e.isFile() && e.name === '.gitignore');
      if (gitignore) {
        const content = await readFileAsync(path.join(dir, gitignore.name), 'utf8');
        const newRules: Rule[] = content.split(/\r?\n/).map(s => {
          s = s.trim();
          if (!s)
            return;
          // Use flipNegate, because we handle negation ourselves.
          const rule = new minimatch.Minimatch(s, { matchBase: true, dot: true, flipNegate: true }) as any;
          if (rule.comment)
            return;
          rule.dir = dir;
          return rule;
        }).filter(rule => !!rule);
        rules = [...rules, ...newRules];
      }
    }

    for (const entry of entries) {
      if (entry.name === '.' || entry.name === '..')
        continue;
      if (entry.isFile() && entry.name === '.gitignore')
        continue;
      if (entry.isDirectory() && entry.name === 'node_modules')
        continue;
      const entryPath = path.join(dir, entry.name);
      const entryStatus = checkIgnores(entryPath, rules, entry.isDirectory(), status);
      if (entry.isDirectory() && entryStatus !== 'ignored')
        await visit(entryPath, rules, entryStatus);
      else if (entry.isFile() && entryStatus === 'included')
        files.push(entryPath);
    }
  };
  await visit(testDir, [], 'included');
  return files;
}


function buildItemLocation(rootDir: string, testOrSuite: Suite | TestCase) {
  if (!testOrSuite.location)
    return '';
  return `${path.relative(rootDir, testOrSuite.location.file)}:${testOrSuite.location.line}`;
}

function createTestGroups(rootSuite: Suite, workers: number): TestGroup[] {
  // This function groups tests that can be run together.
  // Tests cannot be run together when:
  // - They belong to different projects - requires different workers.
  // - They have a different repeatEachIndex - requires different workers.
  // - They have a different set of worker fixtures in the pool - requires different workers.
  // - They have a different requireFile - reuses the worker, but runs each requireFile separately.
  // - They belong to a parallel suite.

  // Using the map "workerHash -> requireFile -> group" makes us preserve the natural order
  // of worker hashes and require files for the simple cases.
  const groups = new Map<string, Map<string, {
    // Tests that must be run in order are in the same group.
    general: TestGroup,

    // There are 3 kinds of parallel tests:
    // - Tests belonging to parallel suites, without beforeAll/afterAll hooks.
    //   These can be run independently, they are put into their own group, key === test.
    // - Tests belonging to parallel suites, with beforeAll/afterAll hooks.
    //   These should share the worker as much as possible, put into single parallelWithHooks group.
    //   We'll divide them into equally-sized groups later.
    // - Tests belonging to serial suites inside parallel suites.
    //   These should run as a serial group, each group is independent, key === serial suite.
    parallel: Map<Suite | TestCase, TestGroup>,
    parallelWithHooks: TestGroup,
  }>>();

  const createGroup = (test: TestCase): TestGroup => {
    return {
      workerHash: test._workerHash,
      requireFile: test._requireFile,
      repeatEachIndex: test.repeatEachIndex,
      projectId: test._projectId,
      tests: [],
      watchMode: false,
    };
  };

  for (const projectSuite of rootSuite.suites) {
    for (const test of projectSuite.allTests()) {
      let withWorkerHash = groups.get(test._workerHash);
      if (!withWorkerHash) {
        withWorkerHash = new Map();
        groups.set(test._workerHash, withWorkerHash);
      }
      let withRequireFile = withWorkerHash.get(test._requireFile);
      if (!withRequireFile) {
        withRequireFile = {
          general: createGroup(test),
          parallel: new Map(),
          parallelWithHooks: createGroup(test),
        };
        withWorkerHash.set(test._requireFile, withRequireFile);
      }

      // Note that a parallel suite cannot be inside a serial suite. This is enforced in TestType.
      let insideParallel = false;
      let outerMostSerialSuite: Suite | undefined;
      let hasAllHooks = false;
      for (let parent: Suite | undefined = test.parent; parent; parent = parent.parent) {
        if (parent._parallelMode === 'serial')
          outerMostSerialSuite = parent;
        insideParallel = insideParallel || parent._parallelMode === 'parallel';
        hasAllHooks = hasAllHooks || parent._hooks.some(hook => hook.type === 'beforeAll' || hook.type === 'afterAll');
      }

      if (insideParallel) {
        if (hasAllHooks && !outerMostSerialSuite) {
          withRequireFile.parallelWithHooks.tests.push(test);
        } else {
          const key = outerMostSerialSuite || test;
          let group = withRequireFile.parallel.get(key);
          if (!group) {
            group = createGroup(test);
            withRequireFile.parallel.set(key, group);
          }
          group.tests.push(test);
        }
      } else {
        withRequireFile.general.tests.push(test);
      }
    }
  }

  const result: TestGroup[] = [];
  for (const withWorkerHash of groups.values()) {
    for (const withRequireFile of withWorkerHash.values()) {
      // Tests without parallel mode should run serially as a single group.
      if (withRequireFile.general.tests.length)
        result.push(withRequireFile.general);

      // Parallel test groups without beforeAll/afterAll can be run independently.
      result.push(...withRequireFile.parallel.values());

      // Tests with beforeAll/afterAll should try to share workers as much as possible.
      const parallelWithHooksGroupSize = Math.ceil(withRequireFile.parallelWithHooks.tests.length / workers);
      let lastGroup: TestGroup | undefined;
      for (const test of withRequireFile.parallelWithHooks.tests) {
        if (!lastGroup || lastGroup.tests.length >= parallelWithHooksGroupSize) {
          lastGroup = createGroup(test);
          result.push(lastGroup);
        }
        lastGroup.tests.push(test);
      }
    }
  }
  return result;
}

class ListModeReporter implements Reporter {
  private config!: FullConfigInternal;

  onBegin(config: FullConfigInternal, suite: Suite): void {
    this.config = config;
    // eslint-disable-next-line no-console
    console.log(`Listing tests:`);
    const tests = suite.allTests();
    const files = new Set<string>();
    for (const test of tests) {
      // root, project, file, ...describes, test
      const [, projectName, , ...titles] = test.titlePath();
      const location = `${path.relative(config.rootDir, test.location.file)}:${test.location.line}:${test.location.column}`;
      const projectTitle = projectName ? `[${projectName}] › ` : '';
      // eslint-disable-next-line no-console
      console.log(`  ${projectTitle}${location} › ${titles.join(' ')}`);
      files.add(test.location.file);
    }
    // eslint-disable-next-line no-console
    console.log(`Total: ${tests.length} ${tests.length === 1 ? 'test' : 'tests'} in ${files.size} ${files.size === 1 ? 'file' : 'files'}`);
  }

  onError(error: TestError) {
    // eslint-disable-next-line no-console
    console.error('\n' + formatError(this.config, error, false).message);
  }
}

function createForbidOnlyError(config: FullConfigInternal, onlyTestsAndSuites: (TestCase | Suite)[]): TestError {
  const errorMessage = [
    '=====================================',
    ' --forbid-only found a focused test.',
  ];
  for (const testOrSuite of onlyTestsAndSuites) {
    // Skip root and file.
    const title = testOrSuite.titlePath().slice(2).join(' ');
    errorMessage.push(` - ${buildItemLocation(config.rootDir, testOrSuite)} > ${title}`);
  }
  errorMessage.push('=====================================');
  return createStacklessError(errorMessage.join('\n'));
}

function createDuplicateTitlesError(config: FullConfigInternal, rootSuite: Suite): TestError | undefined {
  const lines: string[] = [];
  for (const fileSuite of rootSuite.suites) {
    const testsByFullTitle = new MultiMap<string, TestCase>();
    for (const test of fileSuite.allTests()) {
      const fullTitle = test.titlePath().slice(2).join('\x1e');
      testsByFullTitle.set(fullTitle, test);
    }
    for (const fullTitle of testsByFullTitle.keys()) {
      const tests = testsByFullTitle.get(fullTitle);
      if (tests.length > 1) {
        lines.push(` - title: ${fullTitle.replace(/\u001e/g, ' › ')}`);
        for (const test of tests)
          lines.push(`   - ${buildItemLocation(config.rootDir, test)}`);
      }
    }
  }
  if (!lines.length)
    return;
  return createStacklessError([
    '========================================',
    ' duplicate test titles are not allowed.',
    ...lines,
    '========================================',
  ].join('\n'));
}

function createNoTestsError(): TestError {
  return createStacklessError(`=================\n no tests found.\n=================`);
}

function createStacklessError(message: string): TestError {
  return { message, __isNotAFatalError: true } as any;
}

export const builtInReporters = ['list', 'line', 'dot', 'json', 'junit', 'null', 'github', 'html'] as const;
export type BuiltInReporter = typeof builtInReporters[number];
