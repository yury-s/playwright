/**
 * Copyright Microsoft Corporation. All rights reserved.
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

import { AstBuilder, GherkinClassicTokenMatcher, Parser, compile } from '@cucumber/gherkin';
import type { Scenario } from '@cucumber/messages';
import { IdGenerator } from '@cucumber/messages';
import * as fs from 'fs';
import { Suite, TestCase } from './test';
import { test } from './index';
import { TestTypeImpl } from './testType';
import { fixtureParameterNames } from './fixtures';
import { debugTest } from './util';


export async function loadGherkinFeatureFile(parent: Suite, file: string, environment: 'runner' | 'worker') {
  const gherkinDocument = await loadGherkinDocument(file);
  if (!gherkinDocument.feature)
    return;

  const suite = new Suite(gherkinDocument.feature.name, 'describe');
  suite._requireFile = parent._requireFile;
  suite.location = { file, column: 0, ...gherkinDocument.feature.location };
  parent._addSuite(suite);

  // TODO: figure out how to get appropriate test type for the feature!
  const testType = TestTypeImpl._fromTest(test);

  const addTestCaseForScenario = (scenario: Scenario) => {
    const parameterNames = new Set();
    // Derive all parameter names from step definitions.
    for (const step of scenario.steps) {
      // TODO: use keywordType instead to support localization
      const definitions = Suite._globalBddSteps.filter(definition => {
        if (definition.type !== step.keyword.trim())
          return;
        const mathes = definition.expression.match(step.text);
        // console.log(`  matches=${mathes} source=${definition.expression.source}`);
        return !!mathes;
      });
      if (definitions.length === 0)
        throw new Error(`No matching definition for step(${environment}): '${step.text}'\n  mentioned at ${file} ${JSON.stringify(step.location)}`);
      if (definitions.length > 1)
        throw new Error(`Multiple definitions for step(${environment}): '${step.text}'\n  mentioned at ${file} ${JSON.stringify(step.location)}`);

      const names = fixtureParameterNames(definitions[0].fn, definitions[0].location);
      names.forEach(n => parameterNames.add(n));
    }

    const parametersString = Array.from(parameterNames).join(', ');
    // TODO: save parameters names on TestCase instead.
    const testFn = new Function(`{${parametersString}}`, `console.log('Scenario (${parametersString})');`);

    // console.log('fn = ' + testFn);
    const testCase = new TestCase(scenario.name, testFn, testType, { file, column: 0, ...scenario.location });
    if (environment === 'worker') {
      testCase.bddFunction = async (fixtures: any) => {
        debugTest(`running steps for scenario: ${scenario.name}`);
        for (const step of scenario.steps) {
        // TODO: use keywordType instead to support localization
          const definitions = Suite._globalBddSteps.filter(definition => {
            if (definition.type !== step.keyword.trim())
              return;
            const mathes = definition.expression.match(step.text);
            return !!mathes;
          });
          if (definitions.length === 0)
            throw new Error(`No matching definition for step(${environment}): '${step.text}'\n  mentioned at ${file} ${JSON.stringify(step.location)}`);
          if (definitions.length > 1)
            throw new Error(`Multiple definitions for step(${environment}): '${step.text}'\n  mentioned at ${file} ${JSON.stringify(step.location)}`);
          const definition = definitions[0];
          const stepArguments = definition.expression.match(step.text)!.map(arg => arg.getValue({}));
          const fn = definition.fn;// Extract a variable to get a better stack trace ("myTest" vs "TestCase.myTest [as fn]").
          debugTest(`bdd step started: ${step.text}`);
          await fn(fixtures, ...stepArguments);
          debugTest(`bdd step finished: ${step.text}`);
        }
      };
      debugTest(`added testCase.bddFunction`);
    }
    testCase._requireFile = suite._requireFile;
    suite._addTest(testCase);
  };

  for (const child of gherkinDocument.feature.children) {
    if (child.scenario) {
      addTestCaseForScenario(child.scenario);
    } else if (child.rule) {
      for (const ruleItem of child.rule.children) {
        if (ruleItem.scenario)
          addTestCaseForScenario(ruleItem.scenario);
      }
    }
  }
}


export async function loadGherkinDocument(file: string) {
  const uuidFn = IdGenerator.uuid();
  const builder = new AstBuilder(uuidFn);
  const matcher = new GherkinClassicTokenMatcher(); // or GherkinInMarkdownTokenMatcher()

  const parser = new Parser(builder, matcher);
  const content = (await fs.promises.readFile(file)).toString('utf-8');
  const gherkinDocument = parser.parse(content);
  return gherkinDocument;
  //   console.log('*** gherkinDocument = ' + JSON.stringify(gherkinDocument, null, 2));
  //   const pickles = await compile(gherkinDocument, 'file:///home/yurys/sandbox/pw-bdd/tests/features/playwright.feature', uuidFn);
  //   console.log('\n\n\n');

}